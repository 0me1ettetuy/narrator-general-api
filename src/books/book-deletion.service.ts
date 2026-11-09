import { Injectable, NotFoundException } from '@nestjs/common';
import { API_ERROR_CODES } from '../global-filters/api-error.js';
import { JobsService } from '../jobs/jobs.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { temporalNow } from '../prisma/temporal.js';
import { StorageService } from '../storage/storage.service.js';

type BookJob = {
  id: string;
  type: 'PARSE_BOOK' | 'SYNTHESIZE_CHAPTER' | 'MERGE_CHAPTER_AUDIO';
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
};

type Database = Pick<PrismaService['db'], 'orm'>;

@Injectable()
export class BookDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly jobsService: JobsService,
  ) {}

  // Idempotent: a retry after a partial failure finishes the cleanup.
  async deleteBook(userId: string, bookId: string): Promise<void> {
    const jobs = await this.markForDeletion(userId, bookId);

    // Leftover queue entries are harmless; workers refuse cancelled jobs.
    await Promise.allSettled(jobs.map((job) => this.removeQueuedJob(job)));
    await this.storageService.deleteObjectsByPrefix(
      `books/${userId}/${bookId}/`,
    );

    try {
      await this.deleteRows(bookId);
    } catch {
      // A worker claimed just before cancellation may insert one child row.
      await this.deleteRows(bookId);
    }
  }

  private async markForDeletion(
    userId: string,
    bookId: string,
  ): Promise<BookJob[]> {
    return this.prisma.db.transaction(async (transaction) => {
      const book = await transaction.orm.public.Book.where({
        id: bookId,
        userId,
      }).first();

      if (!book) {
        throw new NotFoundException({
          code: API_ERROR_CODES.notFound,
          message: 'Book not found',
        });
      }

      const now = temporalNow();

      if (!book.deletedAt) {
        await transaction.orm.public.Book.where({ id: book.id }).update({
          deletedAt: now,
          updatedAt: now,
        });
      }

      const jobs = (await transaction.orm.public.Job.where({
        bookId: book.id,
      }).all()) as BookJob[];

      for (const job of jobs) {
        if (job.status !== 'QUEUED' && job.status !== 'PROCESSING') {
          continue;
        }

        await transaction.orm.public.Job.where({ id: job.id }).update({
          status: 'CANCELLED',
          error: null,
          completedAt: now,
          updatedAt: now,
        });
      }

      for (const audio of await this.getAudio(transaction, book.id)) {
        if (audio.status === 'DELETING') {
          continue;
        }

        await transaction.orm.public.Audio.where({ id: audio.id }).update({
          status: 'DELETING',
          processingStage: null,
          updatedAt: now,
        });
      }

      return jobs;
    });
  }

  private async deleteRows(bookId: string): Promise<void> {
    await this.prisma.db.transaction(async (transaction) => {
      const audioIds = (await this.getAudio(transaction, bookId)).map(
        (audio) => audio.id,
      );

      if (audioIds.length) {
        await transaction.orm.public.AudioChunk.where((chunk) =>
          chunk.audioId.in(audioIds),
        ).deleteAndCount();
        await transaction.orm.public.Audio.where((audio) =>
          audio.id.in(audioIds),
        ).deleteAndCount();
      }

      await transaction.orm.public.Job.where({ bookId }).deleteAndCount();
      await transaction.orm.public.Chapter.where({ bookId }).deleteAndCount();
      await transaction.orm.public.BookImage.where({ bookId }).deleteAndCount();
      await transaction.orm.public.BookAuthor.where({
        bookId,
      }).deleteAndCount();
      // Other users may have added this book to their own library; those
      // references must not dangle once the book itself is gone.
      await transaction.orm.public.BookLibraryEntry.where({
        bookId,
      }).deleteAndCount();
      // Collections are references too; a permanently deleted book leaves no ghost.
      await transaction.orm.public.CollectionBook.where({
        bookId,
      }).deleteAndCount();
      await transaction.orm.public.Book.where({ id: bookId }).deleteAndCount();
    });
  }

  private async getAudio(
    database: Database,
    bookId: string,
  ): Promise<{ id: string; status: string }[]> {
    // Includes removed chapters: their rows still belong to the book.
    const chapterIds = (
      await database.orm.public.Chapter.where({ bookId }).all()
    ).map((chapter) => chapter.id);

    if (!chapterIds.length) {
      return [];
    }

    return database.orm.public.Audio.where((audio) =>
      audio.chapterId.in(chapterIds),
    ).all();
  }

  private removeQueuedJob(job: BookJob): Promise<void> {
    switch (job.type) {
      case 'PARSE_BOOK':
        return this.jobsService.removeBookParsing(job.id);
      case 'SYNTHESIZE_CHAPTER':
        return this.jobsService.removeChapterSynthesis(job.id);
      case 'MERGE_CHAPTER_AUDIO':
        return this.jobsService.removeAudioMerge(job.id);
    }
  }
}

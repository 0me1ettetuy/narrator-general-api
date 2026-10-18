import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { temporalNow } from '../prisma/temporal.js';
import { StorageService } from '../storage/storage.service.js';
import { EpubParserService } from './epub-parser.service.js';
import type { ParsedEpub } from './types/parsed-epub.type.js';

const BOOK_PARSE_FAILED_ERROR = 'BOOK_PARSE_FAILED';

export type ClaimedBookParsingJob = {
  id: string;
  bookId: string;
  sourceObjectKey: string;
  sourceSize: number;
  maxAttempts: number;
};

@Injectable()
export class BookParsingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly epubParserService: EpubParserService,
  ) {}

  async parse(jobId: string): Promise<ClaimedBookParsingJob | null> {
    const claimedJob = await this.claim(jobId);

    if (!claimedJob) {
      return null;
    }

    const epubBytes = await this.storageService.getObjectBytes(
      claimedJob.sourceObjectKey,
      claimedJob.sourceSize,
    );
    await this.updateProgress(claimedJob.id, 25);

    const parsedEpub = this.epubParserService.parse(epubBytes);
    await this.persistParsedBook(claimedJob, parsedEpub);

    return claimedJob;
  }

  async recordFailure(jobId: string, isFinalAttempt: boolean): Promise<void> {
    const now = temporalNow();

    await this.prisma.db.transaction(async (transaction) => {
      const job = await transaction.orm.public.Job.where({
        id: jobId,
        type: 'PARSE_BOOK',
        status: 'PROCESSING',
      }).first();

      if (!job) {
        return;
      }

      const status = isFinalAttempt ? 'FAILED' : 'QUEUED';
      const bookStatus = isFinalAttempt ? 'FAILED' : 'QUEUED';

      await transaction.orm.public.Job.where({ id: job.id }).update({
        status,
        progress: 0,
        error: BOOK_PARSE_FAILED_ERROR,
        completedAt: isFinalAttempt ? now : null,
        updatedAt: now,
      });
      await transaction.orm.public.Book.where({ id: job.bookId }).update({
        parseStatus: bookStatus,
        parseError: isFinalAttempt ? BOOK_PARSE_FAILED_ERROR : null,
        updatedAt: now,
      });
    });
  }

  private async claim(jobId: string): Promise<ClaimedBookParsingJob | null> {
    const now = temporalNow();

    return this.prisma.db.transaction(async (transaction) => {
      const job = await transaction.orm.public.Job.where({
        id: jobId,
        type: 'PARSE_BOOK',
        status: 'QUEUED',
      }).first();

      if (!job) {
        return null;
      }

      const book = await transaction.orm.public.Book.where({
        id: job.bookId,
        parseStatus: 'QUEUED',
      }).first();

      if (!book) {
        return null;
      }

      await transaction.orm.public.Job.where({ id: job.id }).update({
        status: 'PROCESSING',
        attempts: job.attempts + 1,
        progress: 0,
        error: null,
        startedAt: now,
        completedAt: null,
        updatedAt: now,
      });
      await transaction.orm.public.Book.where({ id: book.id }).update({
        parseStatus: 'PROCESSING',
        parseError: null,
        updatedAt: now,
      });

      return {
        id: job.id,
        bookId: book.id,
        sourceObjectKey: book.sourceObjectKey,
        sourceSize: book.sourceSize,
        maxAttempts: job.maxAttempts,
      };
    });
  }

  private async updateProgress(jobId: string, progress: number): Promise<void> {
    await this.prisma.db.orm.public.Job.where({
      id: jobId,
      status: 'PROCESSING',
    }).update({
      progress,
      updatedAt: temporalNow(),
    });
  }

  private async persistParsedBook(
    job: ClaimedBookParsingJob,
    parsedEpub: ParsedEpub,
  ): Promise<void> {
    const now = temporalNow();

    await this.prisma.db.transaction(async (transaction) => {
      for (const author of parsedEpub.authors.entries()) {
        const [position, name] = author;

        await transaction.orm.public.BookAuthor.create({
          id: randomUUID(),
          bookId: job.bookId,
          name,
          position,
        });
      }

      for (const chapter of parsedEpub.chapters) {
        await transaction.orm.public.Chapter.create({
          id: randomUUID(),
          bookId: job.bookId,
          position: chapter.position,
          title: chapter.title,
          sourceHref: chapter.sourceHref,
          text: chapter.text,
          wordCount: chapter.wordCount,
          updatedAt: now,
        });
      }

      const book = await transaction.orm.public.Book.where({
        id: job.bookId,
        parseStatus: 'PROCESSING',
      }).first();

      if (!book) {
        throw new Error('Book is no longer being parsed');
      }

      await transaction.orm.public.Book.where({ id: book.id }).update({
        title: parsedEpub.title ?? book.title,
        parseStatus: 'READY',
        parseError: null,
        parsedAt: now,
        chapterCount: parsedEpub.chapters.length,
        updatedAt: now,
      });
      await transaction.orm.public.Job.where({
        id: job.id,
        status: 'PROCESSING',
      }).update({
        status: 'COMPLETED',
        progress: 100,
        error: null,
        completedAt: now,
        updatedAt: now,
      });
    });
  }
}

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { temporalNow } from '../prisma/temporal.js';
import { StorageService } from '../storage/storage.service.js';
import { classifyChapter } from './chapter-classifier.js';
import { EpubParserService } from './epub-parser.service.js';
import type { ParsedEpub, ParsedEpubCover } from './types/parsed-epub.type.js';

const BOOK_PARSE_FAILED_ERROR = 'BOOK_PARSE_FAILED';

type StoredBookCover = {
  objectKey: string;
  mimeType: string;
  size: number;
};

export type ClaimedBookParsingJob = {
  id: string;
  bookId: string;
  userId: string;
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
    const cover = await this.storeCover(claimedJob, parsedEpub.cover);
    await this.updateProgress(claimedJob.id, 75);

    try {
      await this.persistParsedBook(claimedJob, parsedEpub, cover);
    } catch (error) {
      if (cover) {
        await this.storageService.deleteObject(cover.objectKey).catch(() => {
          // The parser retry overwrites this deterministic key if cleanup fails.
        });
      }

      throw error;
    }

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
        userId: book.userId,
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
    cover: StoredBookCover | null,
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
        const classification = classifyChapter(chapter);

        await transaction.orm.public.Chapter.create({
          id: randomUUID(),
          bookId: job.bookId,
          position: chapter.position,
          title: chapter.title,
          sourceHref: chapter.sourceHref,
          text: chapter.text,
          wordCount: chapter.wordCount,
          role: classification.role,
          includeInDefaultNarration: classification.includeInDefaultNarration,
          classificationSource: classification.source,
          classificationConfidence: classification.confidence,
          classificationReason: classification.reason,
          origin: 'IMPORTED',
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
        language: parsedEpub.language,
        coverObjectKey: cover?.objectKey ?? null,
        coverMimeType: cover?.mimeType ?? null,
        coverSize: cover?.size ?? null,
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

  private async storeCover(
    job: ClaimedBookParsingJob,
    cover: ParsedEpubCover | null,
  ): Promise<StoredBookCover | null> {
    if (!cover) {
      return null;
    }

    const objectKey = `books/${job.userId}/${job.bookId}/cover/original.${getCoverExtension(
      cover.mimeType,
    )}`;

    await this.storageService.putObjectBytes(
      objectKey,
      cover.bytes,
      cover.mimeType,
    );

    return {
      objectKey,
      mimeType: cover.mimeType,
      size: cover.bytes.byteLength,
    };
  }
}

function getCoverExtension(mimeType: string): string {
  switch (mimeType) {
    case 'image/gif':
      return 'gif';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'jpg';
  }
}

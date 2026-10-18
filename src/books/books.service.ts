import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { API_ERROR_CODES } from '../global-filters/api-error.js';
import { JobsService } from '../jobs/jobs.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { temporalNow } from '../prisma/temporal.js';
import { StorageService } from '../storage/storage.service.js';
import type {
  BookAuthorResponse,
  BookDetailResponse,
  BookSummary,
  BooksListResponse,
  ChapterSummaryResponse,
  CompleteBookUploadResponse,
  CreateBookUploadResponse,
} from './contracts/books.response.js';
import type { BooksListQueryDto } from './dto/books-list-query.dto.js';
import {
  EPUB_MIME_TYPE,
  type CreateBookUploadDto,
} from './dto/create-book-upload.dto.js';
import type { Book, BookAuthor, Chapter } from './types/book.type.js';

const DEFAULT_PAGE_SIZE = 20;
const PARSE_BOOK_IDEMPOTENCY_KEY_PREFIX = 'parse-book';

@Injectable()
export class BooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly jobsService: JobsService,
  ) {}

  async createUpload(
    userId: string,
    dto: CreateBookUploadDto,
  ): Promise<CreateBookUploadResponse> {
    const bookId = randomUUID();
    const sourceObjectKey = `books/${userId}/${bookId}/source/original.epub`;
    const uploadUrl = await this.storageService.createUploadUrl(
      sourceObjectKey,
      EPUB_MIME_TYPE,
    );

    await this.prisma.db.orm.public.Book.create({
      id: bookId,
      userId,
      title: toBookTitle(dto.filename),
      sourceFormat: 'EPUB',
      sourceObjectKey,
      sourceOriginalFilename: dto.filename,
      sourceMimeType: dto.mimeType,
      sourceSize: dto.size,
      updatedAt: temporalNow(),
    });

    return { bookId, uploadUrl };
  }

  async completeUpload(
    userId: string,
    bookId: string,
  ): Promise<CompleteBookUploadResponse> {
    const book = await this.prisma.db.orm.public.Book.where({
      id: bookId,
      userId,
    }).first();

    if (!book) {
      throw new NotFoundException({
        code: API_ERROR_CODES.notFound,
        message: 'Book not found',
      });
    }

    const idempotencyKey = getParseBookIdempotencyKey(book.id);
    const existingJob = await this.prisma.db.orm.public.Job.where({
      idempotencyKey,
    }).first();

    if (book.parseStatus === 'QUEUED' && existingJob) {
      await this.jobsService.enqueueBookParsing(existingJob.id);

      return toCompleteBookUploadResponse(book.id, existingJob.id);
    }

    if (book.parseStatus !== 'UPLOADING') {
      throw new ConflictException({
        code: API_ERROR_CODES.conflict,
        message: 'Book is not awaiting upload confirmation',
      });
    }

    const object = await this.storageService.getObjectMetadata(
      book.sourceObjectKey,
    );

    if (!object) {
      throw new BadRequestException({
        code: API_ERROR_CODES.validationFailed,
        message: 'Uploaded EPUB was not found',
      });
    }

    if (
      object.contentLength !== book.sourceSize ||
      object.contentType !== book.sourceMimeType
    ) {
      throw new BadRequestException({
        code: API_ERROR_CODES.validationFailed,
        message: 'Uploaded EPUB does not match the requested upload metadata',
      });
    }

    const jobId = randomUUID();
    const now = temporalNow();
    const queued = await this.prisma.db.transaction(async (transaction) => {
      const queuedBook = await transaction.orm.public.Book.where({
        id: book.id,
        userId,
        parseStatus: 'UPLOADING',
      }).update({
        parseStatus: 'QUEUED',
        updatedAt: now,
      });

      if (!queuedBook) {
        return false;
      }

      await transaction.orm.public.Job.create({
        id: jobId,
        bookId: book.id,
        type: 'PARSE_BOOK',
        idempotencyKey,
        updatedAt: now,
      });

      return true;
    });

    if (!queued) {
      const concurrentJob = await this.prisma.db.orm.public.Job.where({
        idempotencyKey,
      }).first();

      if (concurrentJob) {
        return toCompleteBookUploadResponse(book.id, concurrentJob.id);
      }

      throw new ConflictException({
        code: API_ERROR_CODES.conflict,
        message: 'Book is not awaiting upload confirmation',
      });
    }

    await this.jobsService.enqueueBookParsing(jobId);

    return toCompleteBookUploadResponse(book.id, jobId);
  }

  async listBooks(
    userId: string,
    query: BooksListQueryDto,
  ): Promise<BooksListResponse> {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const offset = query.offset ?? 0;
    const books = (await this.prisma.db.orm.public.Book.where({ userId })
      .orderBy([(book) => book.createdAt.desc(), (book) => book.id.desc()])
      .offset(offset)
      .limit(limit + 1)
      .all()) as Book[];
    const hasNextPage = books.length > limit;

    return {
      books: books.slice(0, limit).map(toBookSummary),
      nextOffset: hasNextPage ? offset + limit : null,
    };
  }

  async getBook(userId: string, bookId: string): Promise<BookDetailResponse> {
    const book = await this.prisma.db.orm.public.Book.where({
      id: bookId,
      userId,
    }).first();

    if (!book) {
      throw new NotFoundException({
        code: API_ERROR_CODES.notFound,
        message: 'Book not found',
      });
    }

    const [authors, chapters] = (await Promise.all([
      this.prisma.db.orm.public.BookAuthor.where({ bookId }).all(),
      this.prisma.db.orm.public.Chapter.where({ bookId }).all(),
    ])) as [BookAuthor[], Chapter[]];

    return {
      book: toBookSummary(book),
      authors: authors.sort(compareByPosition).map(toBookAuthorResponse),
      chapters: chapters.sort(compareByPosition).map(toChapterSummaryResponse),
    };
  }
}

function toBookSummary(book: Book): BookSummary {
  return {
    id: book.id,
    title: book.title,
    sourceFormat: book.sourceFormat,
    sourceOriginalFilename: book.sourceOriginalFilename,
    sourceMimeType: book.sourceMimeType,
    sourceSize: book.sourceSize,
    parseStatus: book.parseStatus,
    chapterCount: book.chapterCount,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
  };
}

function toBookTitle(filename: string): string {
  const title = filename.replace(/\.epub$/i, '').trim();

  return title || 'Untitled book';
}

function getParseBookIdempotencyKey(bookId: string): string {
  return `${PARSE_BOOK_IDEMPOTENCY_KEY_PREFIX}:${bookId}`;
}

function toCompleteBookUploadResponse(
  bookId: string,
  jobId: string,
): CompleteBookUploadResponse {
  return {
    bookId,
    jobId,
    parseStatus: 'QUEUED',
  };
}

function toBookAuthorResponse(author: BookAuthor): BookAuthorResponse {
  return {
    id: author.id,
    name: author.name,
    position: author.position,
  };
}

function toChapterSummaryResponse(chapter: Chapter): ChapterSummaryResponse {
  return {
    id: chapter.id,
    position: chapter.position,
    title: chapter.title,
    wordCount: chapter.wordCount,
  };
}

function compareByPosition(
  first: BookAuthor | Chapter,
  second: BookAuthor | Chapter,
): number {
  return first.position - second.position || first.id.localeCompare(second.id);
}

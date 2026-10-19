import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { API_ERROR_CODES } from '../global-filters/api-error.js';
import { JOB_MAX_ATTEMPTS } from '../jobs/jobs.constants.js';
import { JobsService } from '../jobs/jobs.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { temporalNow } from '../prisma/temporal.js';
import { StorageService } from '../storage/storage.service.js';
import type {
  BookAuthorResponse,
  BookDetailResponse,
  BookSummary,
  BooksListResponse,
  ChapterAudioJobResponse,
  ChapterAudioResponse,
  ChapterSummaryResponse,
  CompleteBookUploadResponse,
  CreateBookUploadResponse,
  QueueChapterAudioResponse,
} from './contracts/books.response.js';
import type { BooksListQueryDto } from './dto/books-list-query.dto.js';
import {
  EPUB_MIME_TYPE,
  type CreateBookUploadDto,
} from './dto/create-book-upload.dto.js';
import type {
  Audio,
  Book,
  BookAuthor,
  Chapter,
  ProcessingJob,
} from './types/book.type.js';

const DEFAULT_PAGE_SIZE = 20;
const PARSE_BOOK_IDEMPOTENCY_KEY_PREFIX = 'parse-book';
const SYNTHESIZE_CHAPTER_IDEMPOTENCY_KEY_PREFIX = 'synthesize-chapter';

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
        maxAttempts: JOB_MAX_ATTEMPTS,
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

  async queueChapterAudio(
    userId: string,
    bookId: string,
    chapterId: string,
  ): Promise<QueueChapterAudioResponse> {
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

    const chapter = await this.prisma.db.orm.public.Chapter.where({
      id: chapterId,
      bookId: book.id,
    }).first();

    if (!chapter) {
      throw new NotFoundException({
        code: API_ERROR_CODES.notFound,
        message: 'Chapter not found',
      });
    }

    const queued = await this.createOrReuseChapterAudioJob(book.id, chapter.id);

    if (queued.shouldEnqueue) {
      await this.jobsService.enqueueChapterSynthesis(queued.job.id);
    }

    return {
      audio: toChapterAudioResponse(queued.audio),
      job: toChapterAudioJobResponse(queued.job),
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
    const sortedChapters = chapters.sort(compareByPosition);
    const audioByChapterId = new Map(
      (
        await Promise.all(
          sortedChapters.map(async (chapter) => {
            const audio = (await this.prisma.db.orm.public.Audio.where({
              chapterId: chapter.id,
            }).first()) as Audio | null;

            return [chapter.id, audio] as const;
          }),
        )
      ).filter((entry): entry is readonly [string, Audio] => entry[1] !== null),
    );

    return {
      book: toBookSummary(book),
      authors: authors.sort(compareByPosition).map(toBookAuthorResponse),
      chapters: sortedChapters.map((chapter) =>
        toChapterSummaryResponse(
          chapter,
          audioByChapterId.get(chapter.id) ?? null,
        ),
      ),
    };
  }

  private async createOrReuseChapterAudioJob(
    bookId: string,
    chapterId: string,
  ): Promise<{
    audio: Audio;
    job: ProcessingJob;
    shouldEnqueue: boolean;
  }> {
    const idempotencyKey = getSynthesizeChapterIdempotencyKey(chapterId);
    const now = temporalNow();

    return this.prisma.db.transaction(async (transaction) => {
      const audio = (await transaction.orm.public.Audio.where({
        chapterId,
      }).first()) as Audio | null;
      const job = (await transaction.orm.public.Job.where({
        idempotencyKey,
      }).first()) as
        | (ProcessingJob & {
            type: string;
            attempts: number;
          })
        | null;

      if (audio?.status === 'READY' || audio?.status === 'PROCESSING') {
        if (!job) {
          throw new Error('Chapter audio is missing its synthesis job');
        }

        return { audio, job, shouldEnqueue: false };
      }

      const queuedAudio =
        audio ??
        (await transaction.orm.public.Audio.create({
          id: randomUUID(),
          chapterId,
          updatedAt: now,
        }));
      const queuedJob =
        job ??
        (await transaction.orm.public.Job.create({
          id: randomUUID(),
          bookId,
          chapterId,
          type: 'SYNTHESIZE_CHAPTER',
          idempotencyKey,
          maxAttempts: JOB_MAX_ATTEMPTS,
          updatedAt: now,
        }));

      if (queuedJob.type !== 'SYNTHESIZE_CHAPTER') {
        throw new Error('Chapter audio has an invalid job type');
      }

      if (job) {
        await transaction.orm.public.Job.where({ id: queuedJob.id }).update({
          status: 'QUEUED',
          attempts: 0,
          progress: 0,
          error: null,
          startedAt: null,
          completedAt: null,
          updatedAt: now,
        });
      }
      if (audio) {
        await transaction.orm.public.Audio.where({ id: queuedAudio.id }).update(
          {
            status: 'QUEUED',
            processingStage: null,
            error: null,
            completedAt: null,
            updatedAt: now,
          },
        );
      }

      return {
        audio: {
          ...queuedAudio,
          status: 'QUEUED',
          processingStage: null,
          error: null,
        },
        job: {
          ...queuedJob,
          status: 'QUEUED',
          progress: 0,
        },
        shouldEnqueue: true,
      };
    });
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

function getSynthesizeChapterIdempotencyKey(chapterId: string): string {
  return `${SYNTHESIZE_CHAPTER_IDEMPOTENCY_KEY_PREFIX}:${chapterId}`;
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

function toChapterSummaryResponse(
  chapter: Chapter,
  audio: Audio | null,
): ChapterSummaryResponse {
  return {
    id: chapter.id,
    position: chapter.position,
    title: chapter.title,
    wordCount: chapter.wordCount,
    audio: audio ? toChapterAudioResponse(audio) : null,
  };
}

function toChapterAudioResponse(audio: Audio): ChapterAudioResponse {
  return {
    id: audio.id,
    status: audio.status,
    processingStage: audio.processingStage,
    totalChunks: audio.totalChunks,
    completedChunks: audio.completedChunks,
    error: audio.error,
  };
}

function toChapterAudioJobResponse(
  job: ProcessingJob,
): ChapterAudioJobResponse {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
  };
}

function compareByPosition(
  first: BookAuthor | Chapter,
  second: BookAuthor | Chapter,
): number {
  return first.position - second.position || first.id.localeCompare(second.id);
}

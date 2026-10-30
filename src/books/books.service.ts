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
import {
  SIGNED_URL_TTL_SECONDS,
  StorageService,
} from '../storage/storage.service.js';
import { FishVoiceService } from '../tts-models/fish-voice.service.js';
import { TtsModelsService } from '../tts-models/tts-models.service.js';
import type {
  ChapterAudioAccessResponse,
  BatchChapterAudioResponse,
  BookCoverAccessResponse,
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

type StoredAudio = Audio & {
  objectKey: string | null;
};

type CancellableChapterJob = {
  id: string;
  type: 'SYNTHESIZE_CHAPTER' | 'MERGE_CHAPTER_AUDIO';
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
};

type StoredAudioChunk = {
  objectKey: string | null;
};

@Injectable()
export class BooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly jobsService: JobsService,
    private readonly ttsModelsService: TtsModelsService,
    private readonly fishVoices: FishVoiceService,
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
    modelId: string | null,
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
      removedAt: null,
    }).first();

    if (!chapter) {
      throw new NotFoundException({
        code: API_ERROR_CODES.notFound,
        message: 'Chapter not found',
      });
    }

    const selectedModel = await this.ttsModelsService.getSelectableModel(
      userId,
      modelId,
    );
    const voiceId = await this.getVoiceSnapshot(userId, selectedModel.source);

    const queued = await this.createOrReuseChapterAudioJob(
      book.id,
      chapter.id,
      selectedModel.id,
      voiceId,
    );

    if (queued.shouldEnqueue) {
      await this.jobsService.enqueueChapterSynthesis(queued.job.id);
    }

    return {
      audio: toChapterAudioResponse(queued.audio),
      job: toChapterAudioJobResponse(queued.job),
    };
  }

  async queueSelectedChapterAudio(
    userId: string,
    bookId: string,
    chapterIds: string[],
  ): Promise<BatchChapterAudioResponse> {
    const book = await this.getOwnedBook(userId, bookId);
    const chapters = await this.getSelectedChapters(book.id, chapterIds);
    const selectedModel = await this.ttsModelsService.getSelectableModel(
      userId,
      null,
    );
    const voiceId = await this.getVoiceSnapshot(userId, selectedModel.source);

    await this.assertAudioModelsAreCompatible(chapters, selectedModel.id);

    const affectedChapterIds: string[] = [];
    const skippedChapterIds: string[] = [];
    const jobsToEnqueue: string[] = [];

    for (const chapter of chapters) {
      const queued = await this.createOrReuseChapterAudioJob(
        book.id,
        chapter.id,
        selectedModel.id,
        voiceId,
      );

      if (queued.shouldEnqueue) {
        affectedChapterIds.push(chapter.id);
        jobsToEnqueue.push(queued.job.id);
      } else {
        skippedChapterIds.push(chapter.id);
      }
    }

    for (const jobId of jobsToEnqueue) {
      await this.jobsService.enqueueChapterSynthesis(jobId);
    }

    return { affectedChapterIds, skippedChapterIds };
  }

  async cancelChapterAudio(
    userId: string,
    bookId: string,
    chapterId: string,
  ): Promise<ChapterAudioResponse> {
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
      removedAt: null,
    }).first();

    if (!chapter) {
      throw new NotFoundException({
        code: API_ERROR_CODES.notFound,
        message: 'Chapter not found',
      });
    }

    const cancellation = await this.prisma.db.transaction(
      async (transaction) => {
        const audio = (await transaction.orm.public.Audio.where({
          chapterId: chapter.id,
        }).first()) as Audio | null;

        if (!audio) {
          throw new ConflictException({
            code: API_ERROR_CODES.conflict,
            message: 'Chapter audio is not being generated',
          });
        }

        if (audio.status === 'READY') {
          throw new ConflictException({
            code: API_ERROR_CODES.conflict,
            message: 'Completed chapter audio cannot be cancelled',
          });
        }

        if (audio.status === 'CANCELLED') {
          return { audio, jobs: [] as CancellableChapterJob[] };
        }

        if (audio.status !== 'QUEUED' && audio.status !== 'PROCESSING') {
          throw new ConflictException({
            code: API_ERROR_CODES.conflict,
            message: 'Chapter audio is not being generated',
          });
        }

        const jobs = (await transaction.orm.public.Job.where({
          chapterId: chapter.id,
        }).all()) as CancellableChapterJob[];
        const activeJobs = jobs.filter(
          (job) =>
            (job.type === 'SYNTHESIZE_CHAPTER' ||
              job.type === 'MERGE_CHAPTER_AUDIO') &&
            (job.status === 'QUEUED' || job.status === 'PROCESSING'),
        );
        const now = temporalNow();

        await transaction.orm.public.Audio.where({ id: audio.id }).update({
          status: 'CANCELLED',
          processingStage: null,
          error: null,
          completedAt: null,
          updatedAt: now,
        });

        for (const job of activeJobs) {
          await transaction.orm.public.Job.where({ id: job.id }).update({
            status: 'CANCELLED',
            error: null,
            completedAt: now,
            updatedAt: now,
          });
        }

        return {
          audio: {
            ...audio,
            status: 'CANCELLED' as const,
            processingStage: null,
            error: null,
          },
          jobs: activeJobs,
        };
      },
    );

    await Promise.all(
      cancellation.jobs.map((job) =>
        job.type === 'SYNTHESIZE_CHAPTER'
          ? this.jobsService.cancelChapterSynthesis(job.id)
          : this.jobsService.cancelAudioMerge(job.id),
      ),
    );

    return toChapterAudioResponse(cancellation.audio);
  }

  async cancelSelectedChapterAudio(
    userId: string,
    bookId: string,
    chapterIds: string[],
  ): Promise<BatchChapterAudioResponse> {
    const book = await this.getOwnedBook(userId, bookId);
    const chapters = await this.getSelectedChapters(book.id, chapterIds);
    const affectedChapterIds: string[] = [];
    const skippedChapterIds: string[] = [];

    for (const chapter of chapters) {
      const audio = (await this.prisma.db.orm.public.Audio.where({
        chapterId: chapter.id,
      }).first()) as Audio | null;

      if (
        !audio ||
        (audio.status !== 'QUEUED' && audio.status !== 'PROCESSING')
      ) {
        skippedChapterIds.push(chapter.id);
        continue;
      }

      await this.cancelChapterAudio(userId, book.id, chapter.id);
      affectedChapterIds.push(chapter.id);
    }

    return { affectedChapterIds, skippedChapterIds };
  }

  async deleteChapterAudio(
    userId: string,
    bookId: string,
    chapterId: string,
  ): Promise<void> {
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
      removedAt: null,
    }).first();

    if (!chapter) {
      throw new NotFoundException({
        code: API_ERROR_CODES.notFound,
        message: 'Chapter not found',
      });
    }

    const deletion = await this.prisma.db.transaction(async (transaction) => {
      const audio = (await transaction.orm.public.Audio.where({
        chapterId: chapter.id,
      }).first()) as StoredAudio | null;
      const jobs = (await transaction.orm.public.Job.where({
        chapterId: chapter.id,
      }).all()) as CancellableChapterJob[];
      const audioJobs = jobs.filter(
        (job) =>
          job.type === 'SYNTHESIZE_CHAPTER' ||
          job.type === 'MERGE_CHAPTER_AUDIO',
      );

      if (!audio) {
        return {
          audioId: null,
          jobs: audioJobs,
          objectKeys: [] as string[],
        };
      }

      const chunks = (await transaction.orm.public.AudioChunk.where({
        audioId: audio.id,
      }).all()) as StoredAudioChunk[];
      const now = temporalNow();

      await transaction.orm.public.Audio.where({ id: audio.id }).update({
        status: 'DELETING',
        processingStage: null,
        error: null,
        updatedAt: now,
      });

      for (const job of audioJobs) {
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

      return {
        audioId: audio.id,
        jobs: audioJobs,
        objectKeys: [
          audio.objectKey,
          ...chunks.map((chunk) => chunk.objectKey),
        ].filter((objectKey): objectKey is string => Boolean(objectKey)),
      };
    });

    await Promise.all(
      deletion.jobs.map((job) =>
        job.type === 'SYNTHESIZE_CHAPTER'
          ? this.jobsService.removeChapterSynthesis(job.id)
          : this.jobsService.removeAudioMerge(job.id),
      ),
    );
    await this.storageService.deleteObjects(deletion.objectKeys);

    if (!deletion.audioId) {
      await this.deleteChapterAudioJobs(deletion.jobs);

      return;
    }

    await this.prisma.db.transaction(async (transaction) => {
      const audio = await transaction.orm.public.Audio.where({
        id: deletion.audioId as string,
        status: 'DELETING',
      }).first();

      if (!audio) {
        return;
      }

      await transaction.orm.public.AudioChunk.where({
        audioId: deletion.audioId as string,
      }).deleteAndCount();
      await this.deleteChapterAudioJobs(deletion.jobs, transaction);
      await transaction.orm.public.Audio.where({
        id: deletion.audioId as string,
        status: 'DELETING',
      }).deleteAndCount();
    });
  }

  async getChapterAudioAccess(
    userId: string,
    bookId: string,
    chapterId: string,
  ): Promise<ChapterAudioAccessResponse> {
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
      removedAt: null,
    }).first();

    if (!chapter) {
      throw new NotFoundException({
        code: API_ERROR_CODES.notFound,
        message: 'Chapter not found',
      });
    }

    const audio = (await this.prisma.db.orm.public.Audio.where({
      chapterId: chapter.id,
    }).first()) as StoredAudio | null;

    if (!audio || audio.status !== 'READY' || !audio.objectKey) {
      throw new ConflictException({
        code: API_ERROR_CODES.conflict,
        message: 'Chapter audio is not ready',
      });
    }

    const [playbackUrl, downloadUrl] = await Promise.all([
      this.storageService.createDownloadUrl(audio.objectKey),
      this.storageService.createDownloadUrl(audio.objectKey, {
        asAttachment: true,
      }),
    ]);

    return {
      playbackUrl,
      downloadUrl,
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
    };
  }

  async getBookCoverAccess(
    userId: string,
    bookId: string,
  ): Promise<BookCoverAccessResponse> {
    const book = (await this.prisma.db.orm.public.Book.where({
      id: bookId,
      userId,
    }).first()) as Book | null;

    if (!book || !book.coverObjectKey) {
      throw new NotFoundException({
        code: API_ERROR_CODES.notFound,
        message: 'Book cover not found',
      });
    }

    return {
      coverUrl: await this.storageService.createDownloadUrl(
        book.coverObjectKey,
      ),
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
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
      this.prisma.db.orm.public.Chapter.where({
        bookId,
        removedAt: null,
      }).all(),
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
    modelId: string | null,
    voiceId: string | null,
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

      if (audio && audio.modelKey !== modelId) {
        throw new ConflictException({
          code: API_ERROR_CODES.conflict,
          message:
            'Delete the existing chapter audio before changing its model',
        });
      }

      if (audio?.status === 'READY' || audio?.status === 'PROCESSING') {
        if (!job) {
          throw new Error('Chapter audio is missing its synthesis job');
        }

        return { audio, job, shouldEnqueue: false };
      }

      if (audio?.status === 'DELETING') {
        throw new ConflictException({
          code: API_ERROR_CODES.conflict,
          message: 'Chapter audio is being deleted',
        });
      }

      const queuedAudio =
        audio ??
        (await transaction.orm.public.Audio.create({
          id: randomUUID(),
          chapterId,
          modelKey: modelId,
          voice: voiceId,
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
            ...(queuedAudio.voice ? {} : { voice: voiceId }),
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

  private async getVoiceSnapshot(
    userId: string,
    source: 'LOCAL' | 'FISH',
  ): Promise<string | null> {
    return source === 'FISH'
      ? this.fishVoices.resolveVoiceReferenceId(userId)
      : null;
  }

  private async getOwnedBook(userId: string, bookId: string): Promise<Book> {
    const book = (await this.prisma.db.orm.public.Book.where({
      id: bookId,
      userId,
    }).first()) as Book | null;

    if (!book) {
      throw new NotFoundException({
        code: API_ERROR_CODES.notFound,
        message: 'Book not found',
      });
    }

    return book;
  }

  private async getSelectedChapters(
    bookId: string,
    chapterIds: string[],
  ): Promise<Chapter[]> {
    const requestedChapterIds = new Set(chapterIds);
    const chapters = (await this.prisma.db.orm.public.Chapter.where({
      bookId,
      removedAt: null,
    }).all()) as Chapter[];
    const selectedChapters = chapters
      .filter((chapter) => requestedChapterIds.has(chapter.id))
      .sort(compareByPosition);

    if (selectedChapters.length !== requestedChapterIds.size) {
      throw new NotFoundException({
        code: API_ERROR_CODES.notFound,
        message: 'Chapter not found',
      });
    }

    return selectedChapters;
  }

  private async assertAudioModelsAreCompatible(
    chapters: Chapter[],
    modelId: string,
  ): Promise<void> {
    const existingAudio = await Promise.all(
      chapters.map(async (chapter) =>
        this.prisma.db.orm.public.Audio.where({
          chapterId: chapter.id,
        }).first(),
      ),
    );

    if (
      existingAudio.some(
        (audio) => audio && (audio as Audio).modelKey !== modelId,
      )
    ) {
      throw new ConflictException({
        code: API_ERROR_CODES.conflict,
        message: 'Delete the existing chapter audio before changing its model',
      });
    }
  }

  private async deleteChapterAudioJobs(
    jobs: CancellableChapterJob[],
    transaction?: Pick<PrismaService['db'], 'orm'>,
  ): Promise<void> {
    const database = transaction ?? this.prisma.db;

    for (const job of jobs) {
      await database.orm.public.Job.where({ id: job.id }).deleteAndCount();
    }
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
    hasCover: book.coverObjectKey !== null,
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
    role: chapter.role,
    includeInDefaultNarration: chapter.includeInDefaultNarration,
    classificationSource: chapter.classificationSource,
    classificationConfidence: chapter.classificationConfidence,
    classificationReason: chapter.classificationReason,
    audio: audio ? toChapterAudioResponse(audio) : null,
  };
}

function toChapterAudioResponse(audio: Audio): ChapterAudioResponse {
  return {
    id: audio.id,
    modelId: audio.modelKey,
    voice: audio.voice,
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

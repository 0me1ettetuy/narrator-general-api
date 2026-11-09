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
import {
  type SelectableTtsModel,
  TtsModelsService,
} from '../tts-models/tts-models.service.js';
import type {
  ChapterAudioAccessResponse,
  BatchChapterAudioResponse,
  BookCoverAccessResponse,
  BookAuthorResponse,
  BookDetailResponse,
  BookSummary,
  BooksListResponse,
  ChapterAudioJobResponse,
  LibraryBooksListResponse,
  ChapterAudioResponse,
  ChapterSummaryResponse,
  CompleteBookUploadResponse,
  CreateBookCoverUploadResponse,
  CreateBookUploadResponse,
  QueueChapterAudioResponse,
} from './contracts/books.response.js';
import type {
  BooksListQueryDto,
  PublicBooksListQueryDto,
} from './dto/books-list-query.dto.js';
import type { CreateBookCoverUploadDto } from './dto/create-book-cover-upload.dto.js';
import {
  EPUB_MIME_TYPE,
  type CreateBookUploadDto,
} from './dto/create-book-upload.dto.js';
import type { UpdateBookVisibilityDto } from './dto/update-book-visibility.dto.js';
import type {
  Audio,
  Book,
  BookAuthor,
  BookLibraryEntry,
  Chapter,
  ProcessingJob,
} from './types/book.type.js';
import {
  compareByPosition,
  toBookAuthorResponse,
  toBookSummary,
} from './book-summary.mapper.js';

const DEFAULT_PAGE_SIZE = 20;
const PARSE_BOOK_IDEMPOTENCY_KEY_PREFIX = 'parse-book';
const SYNTHESIZE_CHAPTER_IDEMPOTENCY_KEY_PREFIX = 'synthesize-chapter';
const DEFAULT_BOOK_COVER_OBJECT_KEY = 'cover/custom';

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
      deletedAt: null,
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
        deletedAt: null,
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
  ): Promise<LibraryBooksListResponse> {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const offset = query.offset ?? 0;
    const source = query.source ?? 'all';

    const entries =
      source === 'owned'
        ? []
        : ((await this.prisma.db.orm.public.BookLibraryEntry.where({
            userId,
          }).all()) as BookLibraryEntry[]);
    const addedBookIds = entries.map((entry) => entry.bookId);
    const addedBookIdSet = new Set(addedBookIds);

    const ownedBooks =
      source === 'added'
        ? []
        : ((await this.prisma.db.orm.public.Book.where({
            userId,
            deletedAt: null,
          }).all()) as Book[]);
    const addedBooks = addedBookIds.length
      ? ((await this.prisma.db.orm.public.Book.where((book) =>
          book.id.in(addedBookIds),
        ).all()) as Book[])
      : [];
    // Added books can briefly outlive their owner's book being deleted
    // (cleaned up asynchronously by BookDeletionService); filter defensively
    // rather than relying on that cleanup alone.
    const visibleAddedBooks = addedBooks.filter(
      (book) => book.deletedAt === null && book.visibility === 'PUBLIC',
    );
    // shortcut: ghosts aren't paginated, add paging if saved lists grow large.
    const ghosts = addedBooks
      .filter((book) => book.deletedAt === null && book.visibility !== 'PUBLIC')
      .map((book) => ({ bookId: book.id, title: book.title }));
    const combined = [...ownedBooks, ...visibleAddedBooks].sort(
      compareBooksNewestFirst,
    );
    const hasNextPage = combined.length > offset + limit;
    const pageBooks = combined.slice(offset, offset + limit);

    const authors = pageBooks.length
      ? ((await this.prisma.db.orm.public.BookAuthor.where((author) =>
          author.bookId.in(pageBooks.map((book) => book.id)),
        ).all()) as BookAuthor[])
      : [];
    const authorsByBookId = new Map<string, BookAuthor[]>();

    for (const author of authors) {
      const bookAuthors = authorsByBookId.get(author.bookId) ?? [];
      bookAuthors.push(author);
      authorsByBookId.set(author.bookId, bookAuthors);
    }

    return {
      books: pageBooks.map((book) =>
        toBookSummary(
          book,
          userId,
          addedBookIdSet.has(book.id),
          authorsByBookId.get(book.id) ?? [],
        ),
      ),
      nextOffset: hasNextPage ? offset + limit : null,
      ghosts,
    };
  }

  async listPublicBooks(
    userId: string,
    query: PublicBooksListQueryDto,
  ): Promise<BooksListResponse> {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const offset = query.offset ?? 0;
    const search = query.search?.trim().toLowerCase();

    // Title search is applied in-memory (no proven case-insensitive
    // substring operator in this ORM yet), so the public catalogue is
    // fetched whole and paginated after filtering/sorting. Fine for a
    // personal-scale public catalogue; revisit if it grows large.
    const allPublicBooks = (await this.prisma.db.orm.public.Book.where({
      visibility: 'PUBLIC',
      deletedAt: null,
    }).all()) as Book[];
    const matchingBooks = search
      ? allPublicBooks.filter((book) =>
          book.title.toLowerCase().includes(search),
        )
      : allPublicBooks;
    const sortedBooks = matchingBooks.sort(compareBooksNewestFirst);
    const hasNextPage = sortedBooks.length > offset + limit;
    const pageBooks = sortedBooks.slice(offset, offset + limit);

    const [authors, entries] = (await Promise.all([
      pageBooks.length
        ? this.prisma.db.orm.public.BookAuthor.where((author) =>
            author.bookId.in(pageBooks.map((book) => book.id)),
          ).all()
        : Promise.resolve([]),
      this.prisma.db.orm.public.BookLibraryEntry.where({ userId }).all(),
    ])) as [BookAuthor[], BookLibraryEntry[]];
    const authorsByBookId = new Map<string, BookAuthor[]>();

    for (const author of authors) {
      const bookAuthors = authorsByBookId.get(author.bookId) ?? [];
      bookAuthors.push(author);
      authorsByBookId.set(author.bookId, bookAuthors);
    }

    const addedBookIdSet = new Set(entries.map((entry) => entry.bookId));

    return {
      books: pageBooks.map((book) =>
        toBookSummary(
          book,
          userId,
          addedBookIdSet.has(book.id),
          authorsByBookId.get(book.id) ?? [],
        ),
      ),
      nextOffset: hasNextPage ? offset + limit : null,
    };
  }

  async queueChapterAudio(
    userId: string,
    bookId: string,
    chapterId: string,
    modelId: string | null,
    requestedVoiceId: string | null = null,
  ): Promise<QueueChapterAudioResponse> {
    const book = await this.prisma.db.orm.public.Book.where({
      id: bookId,
      userId,
      deletedAt: null,
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
    const voiceId = await this.getVoiceSnapshot(
      userId,
      selectedModel,
      book.language,
      requestedVoiceId,
    );

    const queued = await this.createOrReuseChapterAudioJob(
      book.id,
      chapter.id,
      selectedModel.id,
      voiceId,
    );

    if (queued.shouldEnqueue) {
      await this.jobsService.enqueueChapterSynthesis(
        queued.job.id,
        selectedModel.source,
      );
    }

    const voiceNamesByReferenceId =
      await this.getVoiceNamesByReferenceId(userId);

    return {
      audio: toChapterAudioResponse(queued.audio, voiceNamesByReferenceId),
      job: toChapterAudioJobResponse(queued.job),
    };
  }

  async queueSelectedChapterAudio(
    userId: string,
    bookId: string,
    chapterIds: string[],
    requestedVoiceId: string | null = null,
    regenerate = false,
  ): Promise<BatchChapterAudioResponse> {
    const book = await this.getOwnedBook(userId, bookId);
    const chapters = await this.getSelectedChapters(book.id, chapterIds);
    const selectedModel = await this.ttsModelsService.getSelectableModel(
      userId,
      null,
    );
    const voiceId = await this.getVoiceSnapshot(
      userId,
      selectedModel,
      book.language,
      requestedVoiceId,
    );

    await this.assertAudioModelsAreCompatible(
      chapters,
      selectedModel.id,
      regenerate,
    );

    const affectedChapterIds: string[] = [];
    const skippedChapterIds: string[] = [];
    const jobsToEnqueue: string[] = [];

    for (const chapter of chapters) {
      if (regenerate) {
        await this.resetReadyChapterAudio(
          chapter.id,
          selectedModel.id,
          voiceId,
        );
      }

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
      await this.jobsService.enqueueChapterSynthesis(
        jobId,
        selectedModel.source,
      );
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
      deletedAt: null,
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

    const voiceNamesByReferenceId =
      await this.getVoiceNamesByReferenceId(userId);

    return toChapterAudioResponse(cancellation.audio, voiceNamesByReferenceId);
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
      deletedAt: null,
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
        id: deletion.audioId,
        status: 'DELETING',
      }).first();

      if (!audio) {
        return;
      }

      await transaction.orm.public.AudioChunk.where({
        audioId: deletion.audioId,
      }).deleteAndCount();
      await this.deleteChapterAudioJobs(deletion.jobs, transaction);
      await transaction.orm.public.Audio.where({
        id: deletion.audioId,
        status: 'DELETING',
      }).deleteAndCount();
    });
  }

  async getChapterAudioAccess(
    userId: string,
    bookId: string,
    chapterId: string,
  ): Promise<ChapterAudioAccessResponse> {
    const book = await this.getReadableBook(userId, bookId);

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
    const book = await this.getReadableBook(userId, bookId);

    if (!book.coverObjectKey) {
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

  async createBookCoverUpload(
    userId: string,
    bookId: string,
    dto: CreateBookCoverUploadDto,
  ): Promise<CreateBookCoverUploadResponse> {
    const book = await this.getBookReadyForCoverUpdate(userId, bookId);
    const objectKey = book.coverObjectKey ?? getDefaultBookCoverObjectKey(book);

    return {
      uploadUrl: await this.storageService.createUploadUrl(
        objectKey,
        dto.mimeType,
      ),
    };
  }

  async completeBookCoverUpload(
    userId: string,
    bookId: string,
    dto: CreateBookCoverUploadDto,
  ): Promise<void> {
    const book = await this.getBookReadyForCoverUpdate(userId, bookId);
    const objectKey = book.coverObjectKey ?? getDefaultBookCoverObjectKey(book);
    const object = await this.storageService.getObjectMetadata(objectKey);

    if (
      !object ||
      object.contentLength !== dto.size ||
      object.contentType !== dto.mimeType
    ) {
      throw new BadRequestException({
        code: API_ERROR_CODES.validationFailed,
        message: 'Uploaded cover does not match the requested upload metadata',
      });
    }

    await this.prisma.db.orm.public.Book.where({
      id: book.id,
      userId,
      parseStatus: 'READY',
      deletedAt: null,
    }).update({
      coverObjectKey: objectKey,
      coverMimeType: dto.mimeType,
      coverSize: dto.size,
      updatedAt: temporalNow(),
    });
  }

  async getBook(userId: string, bookId: string): Promise<BookDetailResponse> {
    const book = await this.getReadableBook(userId, bookId);

    const [authors, chapters, voiceNamesByReferenceId, isAdded] =
      (await Promise.all([
        this.prisma.db.orm.public.BookAuthor.where({ bookId }).all(),
        this.prisma.db.orm.public.Chapter.where({
          bookId,
          removedAt: null,
        }).all(),
        this.getVoiceNamesByReferenceId(userId),
        this.isBookAdded(userId, bookId),
      ])) as [BookAuthor[], Chapter[], ReadonlyMap<string, string>, boolean];
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
      book: toBookSummary(
        book,
        userId,
        isAdded,
        authors.sort(compareByPosition),
      ),
      authors: authors.sort(compareByPosition).map(toBookAuthorResponse),
      chapters: sortedChapters.map((chapter) =>
        toChapterSummaryResponse(
          chapter,
          audioByChapterId.get(chapter.id) ?? null,
          voiceNamesByReferenceId,
        ),
      ),
    };
  }

  async updateVisibility(
    userId: string,
    bookId: string,
    dto: UpdateBookVisibilityDto,
  ): Promise<BookSummary> {
    const book = await this.getOwnedBook(userId, bookId);

    if (dto.visibility === 'PUBLIC' && book.parseStatus !== 'READY') {
      throw new ConflictException({
        code: API_ERROR_CODES.conflict,
        message: 'Only a fully parsed book can be made public',
      });
    }

    if (book.visibility === dto.visibility) {
      return toBookSummary(book, userId, false);
    }

    const updated = (await this.prisma.db.orm.public.Book.where({
      id: book.id,
      userId,
    }).update({
      visibility: dto.visibility,
      updatedAt: temporalNow(),
    })) as Book;

    return toBookSummary(updated, userId, false);
  }

  async addToLibrary(userId: string, bookId: string): Promise<void> {
    const book = await this.getReadableBook(userId, bookId);

    if (book.visibility !== 'PUBLIC') {
      throw new NotFoundException({
        code: API_ERROR_CODES.notFound,
        message: 'Book not found',
      });
    }

    if (book.userId === userId) {
      throw new ConflictException({
        code: API_ERROR_CODES.conflict,
        message: 'You already own this book',
      });
    }

    if (await this.isBookAdded(userId, bookId)) {
      return;
    }

    await this.prisma.db.orm.public.BookLibraryEntry.create({
      id: randomUUID(),
      userId,
      bookId,
    });
  }

  async removeFromLibrary(userId: string, bookId: string): Promise<void> {
    await this.prisma.db.orm.public.BookLibraryEntry.where({
      userId,
      bookId,
    }).deleteAndCount();
  }

  async copyBook(
    userId: string,
    bookId: string,
  ): Promise<CompleteBookUploadResponse> {
    const source = await this.prisma.db.orm.public.Book.where({
      id: bookId,
      deletedAt: null,
    }).first();

    if (!source || source.visibility !== 'PUBLIC') {
      throw new NotFoundException({
        code: API_ERROR_CODES.notFound,
        message: 'Book not found',
      });
    }

    if (source.userId === userId) {
      throw new ConflictException({
        code: API_ERROR_CODES.conflict,
        message: 'You already own this book',
      });
    }

    const newBookId = randomUUID();
    const sourceObjectKey = `books/${userId}/${newBookId}/source/original.epub`;

    await this.storageService.copyObject(
      source.sourceObjectKey,
      sourceObjectKey,
    );

    const now = temporalNow();
    const jobId = randomUUID();
    const idempotencyKey = getParseBookIdempotencyKey(newBookId);

    await this.prisma.db.transaction(async (transaction) => {
      await transaction.orm.public.Book.create({
        id: newBookId,
        userId,
        title: source.title,
        sourceFormat: 'EPUB',
        sourceObjectKey,
        sourceOriginalFilename: source.sourceOriginalFilename,
        sourceMimeType: source.sourceMimeType,
        sourceSize: source.sourceSize,
        sourceChecksum: source.sourceChecksum,
        parseStatus: 'QUEUED',
        updatedAt: now,
      });
      await transaction.orm.public.Job.create({
        id: jobId,
        bookId: newBookId,
        type: 'PARSE_BOOK',
        idempotencyKey,
        maxAttempts: JOB_MAX_ATTEMPTS,
        updatedAt: now,
      });
    });

    await this.jobsService.enqueueBookParsing(jobId);

    return toCompleteBookUploadResponse(newBookId, jobId);
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
    model: SelectableTtsModel,
    bookLanguage: string | null,
    requestedVoiceId: string | null,
  ): Promise<string | null> {
    if (model.source === 'FISH') {
      // Fish voices come from the user's own saved selection, not the request.
      if (requestedVoiceId) {
        throw new BadRequestException({
          code: API_ERROR_CODES.validationFailed,
          message: 'Fish Audio voices are chosen on the Models page',
        });
      }

      return this.fishVoices.resolveVoiceReferenceId(userId);
    }

    return this.ttsModelsService.resolveLocalVoiceId(
      model.id,
      bookLanguage,
      requestedVoiceId,
    );
  }

  // Public: also used by ChapterCurationService, which composes this
  // service rather than injecting FishVoiceService itself.
  async getVoiceNamesByReferenceId(
    userId: string,
  ): Promise<ReadonlyMap<string, string>> {
    const voices = await this.fishVoices.getVoices(userId);

    return new Map([
      ...this.ttsModelsService.getLocalVoiceNames(),
      ...voices.map((voice): [string, string] => [
        voice.referenceId,
        voice.name,
      ]),
    ]);
  }

  private async getOwnedBook(userId: string, bookId: string): Promise<Book> {
    const book = await this.prisma.db.orm.public.Book.where({
      id: bookId,
      userId,
      deletedAt: null,
    }).first();

    if (!book) {
      throw new NotFoundException({
        code: API_ERROR_CODES.notFound,
        message: 'Book not found',
      });
    }

    return book;
  }

  // Owner or public: used by every read-only book endpoint. Mutating
  // endpoints must keep using getOwnedBook instead — visibility only ever
  // relaxes reads, never writes. Never reveals whether a private id exists.
  private async getReadableBook(userId: string, bookId: string): Promise<Book> {
    const book = await this.prisma.db.orm.public.Book.where({
      id: bookId,
      deletedAt: null,
    }).first();

    if (!book || (book.userId !== userId && book.visibility !== 'PUBLIC')) {
      throw new NotFoundException({
        code: API_ERROR_CODES.notFound,
        message: 'Book not found',
      });
    }

    return book;
  }

  private async isBookAdded(userId: string, bookId: string): Promise<boolean> {
    const entry = await this.prisma.db.orm.public.BookLibraryEntry.where({
      userId,
      bookId,
    }).first();

    return entry !== null;
  }

  private async getBookReadyForCoverUpdate(
    userId: string,
    bookId: string,
  ): Promise<Book> {
    const book = await this.getOwnedBook(userId, bookId);

    if (book.parseStatus !== 'READY') {
      throw new ConflictException({
        code: API_ERROR_CODES.conflict,
        message: 'Book must finish parsing before its cover can be changed',
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

  // Regeneration discards a READY chapter's audio, so a model change is fine
  // for it; only audio that is kept still has to match the selected model.
  private async assertAudioModelsAreCompatible(
    chapters: Chapter[],
    modelId: string,
    regenerate: boolean,
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
        (audio) =>
          audio &&
          (audio as Audio).modelKey !== modelId &&
          !(regenerate && (audio as Audio).status === 'READY'),
      )
    ) {
      throw new ConflictException({
        code: API_ERROR_CODES.conflict,
        message: 'Delete the existing chapter audio before changing its model',
      });
    }
  }

  /**
   * Turns a READY chapter audio back into a fresh QUEUED one: its chunks and
   * files are dropped so the worker re-plans from the current chapter text and
   * re-synthesizes everything instead of reusing the stored parts.
   */
  private async resetReadyChapterAudio(
    chapterId: string,
    modelId: string,
    voiceId: string | null,
  ): Promise<void> {
    const objectKeys = await this.prisma.db.transaction(async (transaction) => {
      const audio = (await transaction.orm.public.Audio.where({
        chapterId,
        status: 'READY',
      }).first()) as StoredAudio | null;

      if (!audio) {
        return [];
      }

      const chunks = (await transaction.orm.public.AudioChunk.where({
        audioId: audio.id,
      }).all()) as StoredAudioChunk[];

      await transaction.orm.public.AudioChunk.where({
        audioId: audio.id,
      }).deleteAndCount();
      await transaction.orm.public.Audio.where({
        id: audio.id,
        status: 'READY',
      }).update({
        status: 'QUEUED',
        processingStage: null,
        totalChunks: 0,
        completedChunks: 0,
        objectKey: null,
        mimeType: null,
        modelKey: modelId,
        provider: null,
        voice: voiceId,
        durationMs: null,
        byteSize: null,
        error: null,
        completedAt: null,
        updatedAt: temporalNow(),
      });

      return [
        audio.objectKey,
        ...chunks.map((chunk) => chunk.objectKey),
      ].filter((objectKey): objectKey is string => Boolean(objectKey));
    });

    await this.storageService.deleteObjects(objectKeys);
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

function toBookTitle(filename: string): string {
  const title = filename.replace(/\.epub$/i, '').trim();

  return title || 'Untitled book';
}

function getDefaultBookCoverObjectKey(book: Book): string {
  return `books/${book.userId}/${book.id}/${DEFAULT_BOOK_COVER_OBJECT_KEY}`;
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

function toChapterSummaryResponse(
  chapter: Chapter,
  audio: Audio | null,
  voiceNamesByReferenceId: ReadonlyMap<string, string>,
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
    audio: audio
      ? toChapterAudioResponse(audio, voiceNamesByReferenceId)
      : null,
  };
}

function toChapterAudioResponse(
  audio: Audio,
  voiceNamesByReferenceId: ReadonlyMap<string, string>,
): ChapterAudioResponse {
  return {
    id: audio.id,
    modelId: audio.modelKey,
    voice: audio.voice,
    // Resolved at response time against the user's current voice catalogue,
    // not stored on Audio: the snapshotted `voice` id is what generation
    // uses and must never change, but its display name can (a rename, or
    // the voice being archived later) without touching past audio rows.
    voiceName: audio.voice
      ? (voiceNamesByReferenceId.get(audio.voice) ?? null)
      : null,
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

function compareBooksNewestFirst(first: Book, second: Book): number {
  return (
    second.createdAt.epochMilliseconds - first.createdAt.epochMilliseconds ||
    second.id.localeCompare(first.id)
  );
}

import { ConflictException, NotFoundException } from '@nestjs/common';
import type { JobsService } from '../jobs/jobs.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { temporalFromEpochMilliseconds } from '../prisma/temporal.js';
import type { StorageService } from '../storage/storage.service.js';
import type { FishVoiceService } from '../tts-models/fish-voice.service.js';
import type { TtsModelsService } from '../tts-models/tts-models.service.js';
import type {
  Audio,
  Book,
  BookAuthor,
  BookLibraryEntry,
  Chapter,
  ProcessingJob,
} from './types/book.type.js';

jest.mock('../jobs/jobs.service.js', () => ({
  JobsService: class JobsService {},
}));

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../storage/storage.service.js', () => ({
  StorageService: class StorageService {},
  SIGNED_URL_TTL_SECONDS: 15 * 60,
}));

jest.mock('../tts-models/tts-models.service.js', () => ({
  TtsModelsService: class TtsModelsService {},
}));
jest.mock('../tts-models/fish-voice.service.js', () => ({
  FishVoiceService: class FishVoiceService {},
}));

import { BooksService } from './books.service.js';

type ChapterAudioQueue = {
  audio: Audio;
  job: ProcessingJob;
  shouldEnqueue: boolean;
};

type BooksServiceInternals = {
  createOrReuseChapterAudioJob: (
    bookId: string,
    chapterId: string,
    modelId: string | null,
    voiceId: string | null,
  ) => Promise<ChapterAudioQueue>;
};

describe('BooksService', () => {
  const otherUserId = 'other-user-id';
  const book = {
    id: 'book-id',
    userId: 'user-id',
    title: 'Book title',
    sourceObjectKey: 'books/user-id/book-id/source/original.epub',
    sourceOriginalFilename: 'book.epub',
    sourceMimeType: 'application/epub+zip',
    sourceSize: 100,
    sourceChecksum: null,
    coverObjectKey: null,
    parseStatus: 'READY',
    visibility: 'PRIVATE',
    deletedAt: null,
  } as Book;
  const firstChapter = {
    id: 'first-chapter-id',
    bookId: book.id,
    position: 1,
  } as Chapter;
  const secondChapter = {
    id: 'second-chapter-id',
    bookId: book.id,
    position: 2,
  } as Chapter;
  const bookFirst = jest.fn();
  const chaptersAll = jest.fn();
  const authorsAll = jest.fn();
  const audioFirst = jest.fn();
  const bookUpdate = jest.fn().mockResolvedValue(undefined);
  const bookCreate = jest.fn().mockResolvedValue(undefined);
  const jobCreate = jest.fn().mockResolvedValue(undefined);
  const libraryEntryFirst = jest.fn().mockResolvedValue(null);
  const libraryEntryAll = jest.fn().mockResolvedValue([]);
  const libraryEntryCreate = jest.fn().mockResolvedValue(undefined);
  const libraryEntryDeleteAndCount = jest.fn().mockResolvedValue(0);
  const db = {
    orm: {
      public: {
        Audio: { where: jest.fn() },
        AudioChunk: { where: jest.fn() },
        Book: { where: jest.fn(), create: bookCreate },
        BookAuthor: { where: jest.fn() },
        BookLibraryEntry: {
          where: jest.fn(),
          create: libraryEntryCreate,
        },
        Chapter: { where: jest.fn() },
        Job: { create: jobCreate },
      },
    },
  };
  const transaction = jest.fn(async (callback: (tx: typeof db) => unknown) =>
    callback(db),
  );
  const prisma = {
    db: { ...db, transaction },
  } as unknown as PrismaService;
  const jobsService = {
    enqueueChapterSynthesis: jest.fn().mockResolvedValue(undefined),
    enqueueBookParsing: jest.fn().mockResolvedValue(undefined),
  } as unknown as JobsService;
  const storage = {
    createDownloadUrl: jest.fn(),
    createUploadUrl: jest.fn(),
    getObjectMetadata: jest.fn(),
    copyObject: jest.fn().mockResolvedValue(undefined),
    deleteObjects: jest.fn().mockResolvedValue(undefined),
  };
  const storageService = storage as unknown as StorageService;
  const ttsModelsService = {
    getSelectableModel: jest.fn(),
    resolveLocalVoiceId: jest.fn().mockReturnValue(null),
    getLocalVoiceNames: jest.fn().mockReturnValue(new Map([['ryan', 'Ryan']])),
  } as unknown as TtsModelsService;
  const fishVoices = {
    resolveVoiceReferenceId: jest.fn(),
    getVoices: jest.fn().mockResolvedValue([]),
  } as unknown as FishVoiceService;

  beforeEach(() => {
    jest.clearAllMocks();
    book.coverObjectKey = null;
    book.visibility = 'PRIVATE';
    bookFirst.mockResolvedValue(book);
    chaptersAll.mockResolvedValue([secondChapter, firstChapter]);
    audioFirst.mockResolvedValue(null);
    db.orm.public.Book.where.mockReturnValue({
      first: bookFirst,
      update: bookUpdate,
      all: jest.fn().mockResolvedValue([book]),
    });
    db.orm.public.Chapter.where.mockReturnValue({ all: chaptersAll });
    db.orm.public.BookAuthor.where.mockReturnValue({ all: authorsAll });
    db.orm.public.Audio.where.mockReturnValue({ first: audioFirst });
    libraryEntryFirst.mockResolvedValue(null);
    libraryEntryAll.mockResolvedValue([]);
    db.orm.public.BookLibraryEntry.where.mockReturnValue({
      first: libraryEntryFirst,
      all: libraryEntryAll,
      deleteAndCount: libraryEntryDeleteAndCount,
    });
    jest.mocked(ttsModelsService.getSelectableModel).mockResolvedValue({
      id: 'local.piper.en-us-amy',
      source: 'LOCAL',
      providerModel: null,
    });
  });

  const createService = () =>
    new BooksService(
      prisma,
      storageService,
      jobsService,
      ttsModelsService,
      fishVoices,
    );

  it('lists each book with its authors using one bounded author query', async () => {
    const firstListedBook = {
      ...book,
      id: 'first-book-id',
      title: 'First book',
      language: 'en',
      sourceFormat: 'EPUB',
      sourceOriginalFilename: 'first.epub',
      sourceMimeType: 'application/epub+zip',
      sourceSize: 100,
      chapterCount: 2,
      createdAt: temporalFromEpochMilliseconds(2_000),
      updatedAt: temporalFromEpochMilliseconds(2_000),
    } as Book;
    const secondListedBook = {
      ...firstListedBook,
      id: 'second-book-id',
      title: 'Second book',
      sourceOriginalFilename: 'second.epub',
      createdAt: temporalFromEpochMilliseconds(1_000),
      updatedAt: temporalFromEpochMilliseconds(1_000),
    } as Book;
    const all = jest
      .fn()
      .mockResolvedValue([firstListedBook, secondListedBook]);

    authorsAll.mockResolvedValue([
      {
        id: 'second-author',
        bookId: firstListedBook.id,
        name: 'Second author',
        position: 2,
      },
      {
        id: 'first-author',
        bookId: firstListedBook.id,
        name: 'First author',
        position: 1,
      },
    ] as BookAuthor[]);
    db.orm.public.Book.where.mockImplementation((criteria) => {
      if (criteria.userId === 'user-id' && !('id' in criteria)) {
        return { all };
      }

      return { first: bookFirst, update: bookUpdate };
    });

    const service = createService();

    await expect(service.listBooks('user-id', {})).resolves.toMatchObject({
      books: [
        {
          id: firstListedBook.id,
          authors: [
            { id: 'first-author', name: 'First author', position: 1 },
            { id: 'second-author', name: 'Second author', position: 2 },
          ],
        },
        { id: secondListedBook.id, authors: [] },
      ],
      nextOffset: null,
    });

    const authorWhere = db.orm.public.BookAuthor.where.mock.calls[0]?.[0];
    const bookIdIn = jest.fn();

    expect(authorWhere).toEqual(expect.any(Function));
    authorWhere({ bookId: { in: bookIdIn } });
    expect(bookIdIn).toHaveBeenCalledWith([
      firstListedBook.id,
      secondListedBook.id,
    ]);
  });

  describe('listing active audio', () => {
    const audioRow = (chapterId: string, createdAt: number, status: string) =>
      ({
        id: `audio-${chapterId}`,
        chapterId,
        status,
        processingStage: status === 'PROCESSING' ? 'GENERATING' : null,
        totalChunks: 12,
        completedChunks: 7,
        modelKey: null,
        voice: null,
        error: null,
        createdAt: temporalFromEpochMilliseconds(createdAt),
      }) as unknown as Audio;
    const chapter = (id: string, bookId: string, position: number) =>
      ({
        id,
        bookId,
        position,
        title: id,
        removedAt: null,
      }) as unknown as Chapter;
    const listedBook = (id: string, userId: string, deleted = false) =>
      ({
        ...book,
        id,
        userId,
        title: id,
        coverObjectKey: null,
        deletedAt: deleted ? temporalFromEpochMilliseconds(1) : null,
      }) as unknown as Book;

    it('returns only the caller’s live books, chapters in order, oldest request first', async () => {
      db.orm.public.Audio.where.mockReturnValue({
        all: jest
          .fn()
          .mockResolvedValue([
            audioRow('b2-c1', 3_000, 'QUEUED'),
            audioRow('b1-c2', 2_000, 'QUEUED'),
            audioRow('b1-c1', 1_000, 'PROCESSING'),
            audioRow('other-c1', 500, 'PROCESSING'),
            audioRow('gone-c1', 400, 'PROCESSING'),
          ]),
      });
      chaptersAll.mockResolvedValue([
        chapter('b2-c1', 'book-2', 0),
        chapter('b1-c2', 'book-1', 1),
        chapter('b1-c1', 'book-1', 0),
        chapter('other-c1', 'other-book', 0),
        chapter('gone-c1', 'deleted-book', 0),
      ]);
      db.orm.public.Book.where.mockReturnValue({
        all: jest
          .fn()
          .mockResolvedValue([
            listedBook('book-2', 'user-id'),
            listedBook('book-1', 'user-id'),
            listedBook('other-book', otherUserId),
            listedBook('deleted-book', 'user-id', true),
          ]),
      });

      const result = await createService().listActiveAudio('user-id');

      expect(result.books.map((entry) => entry.bookId)).toEqual([
        'book-1',
        'book-2',
      ]);
      expect(result.books[0].chapters.map((entry) => entry.id)).toEqual([
        'b1-c1',
        'b1-c2',
      ]);
      expect(result.books[0].chapters[0].audio).toMatchObject({
        status: 'PROCESSING',
        completedChunks: 7,
        totalChunks: 12,
      });
    });

    it('returns an empty list without further queries when nothing is active', async () => {
      db.orm.public.Audio.where.mockReturnValue({
        all: jest.fn().mockResolvedValue([]),
      });

      await expect(createService().listActiveAudio('user-id')).resolves.toEqual(
        { books: [] },
      );
      expect(db.orm.public.Book.where).not.toHaveBeenCalled();
    });
  });

  it('queues selected chapters in book order through the saved user model', async () => {
    const service = new BooksService(
      prisma,
      storageService,
      jobsService,
      ttsModelsService,
      fishVoices,
    );
    const createAudioJob = jest
      .spyOn(
        service as unknown as BooksServiceInternals,
        'createOrReuseChapterAudioJob',
      )
      .mockResolvedValueOnce({
        audio: {} as Audio,
        job: { id: 'first-job-id' } as ProcessingJob,
        shouldEnqueue: true,
      })
      .mockResolvedValueOnce({
        audio: {} as Audio,
        job: { id: 'second-job-id' } as ProcessingJob,
        shouldEnqueue: false,
      });

    await expect(
      service.queueSelectedChapterAudio('user-id', book.id, [
        secondChapter.id,
        firstChapter.id,
      ]),
    ).resolves.toEqual({
      affectedChapterIds: [firstChapter.id],
      skippedChapterIds: [secondChapter.id],
    });

    expect(ttsModelsService.getSelectableModel).toHaveBeenCalledWith(
      'user-id',
      null,
    );
    expect(createAudioJob).toHaveBeenNthCalledWith(
      1,
      book.id,
      firstChapter.id,
      'local.piper.en-us-amy',
      null,
    );
    expect(createAudioJob).toHaveBeenNthCalledWith(
      2,
      book.id,
      secondChapter.id,
      'local.piper.en-us-amy',
      null,
    );
    expect(jobsService.enqueueChapterSynthesis).toHaveBeenCalledWith(
      'first-job-id',
      'LOCAL',
    );
  });

  describe('regenerating ready chapter audio', () => {
    const readyAudio = {
      id: 'audio-id',
      chapterId: firstChapter.id,
      status: 'READY',
      modelKey: 'local.other-model',
      objectKey: 'books/user-id/book-id/audio/final.mp3',
    };
    const audioUpdate = jest.fn().mockResolvedValue(undefined);
    const chunkDelete = jest.fn().mockResolvedValue(1);

    const createRegenerateService = () => {
      chaptersAll.mockResolvedValue([firstChapter]);
      audioFirst.mockResolvedValue(readyAudio);
      db.orm.public.Audio.where.mockReturnValue({
        first: audioFirst,
        update: audioUpdate,
      });
      db.orm.public.AudioChunk.where.mockReturnValue({
        all: jest
          .fn()
          .mockResolvedValue([{ objectKey: 'books/user-id/parts/0.mp3' }]),
        deleteAndCount: chunkDelete,
      });
      const service = createService();
      jest
        .spyOn(
          service as unknown as BooksServiceInternals,
          'createOrReuseChapterAudioJob',
        )
        .mockResolvedValue({
          audio: {} as Audio,
          job: { id: 'job-id' } as ProcessingJob,
          shouldEnqueue: true,
        });

      return service;
    };

    it('drops the old audio and queues it again, even with a different model', async () => {
      const service = createRegenerateService();

      await expect(
        service.queueSelectedChapterAudio(
          'user-id',
          book.id,
          [firstChapter.id],
          null,
          true,
        ),
      ).resolves.toEqual({
        affectedChapterIds: [firstChapter.id],
        skippedChapterIds: [],
      });

      expect(chunkDelete).toHaveBeenCalled();
      expect(audioUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'QUEUED',
          objectKey: null,
          modelKey: 'local.piper.en-us-amy',
        }),
      );
      expect(storage.deleteObjects).toHaveBeenCalledWith([
        readyAudio.objectKey,
        'books/user-id/parts/0.mp3',
      ]);
      expect(jobsService.enqueueChapterSynthesis).toHaveBeenCalledWith(
        'job-id',
        'LOCAL',
      );
    });

    it('still refuses a model change when not regenerating', async () => {
      const service = createRegenerateService();

      await expect(
        service.queueSelectedChapterAudio('user-id', book.id, [
          firstChapter.id,
        ]),
      ).rejects.toThrow(ConflictException);
      expect(chunkDelete).not.toHaveBeenCalled();
      expect(storage.deleteObjects).not.toHaveBeenCalled();
    });
  });

  it('sends chapters for a Fish model to the Fish queue', async () => {
    jest.mocked(ttsModelsService.getSelectableModel).mockResolvedValue({
      id: 'fish.s2.1-pro',
      source: 'FISH',
      providerModel: 's2.1-pro',
    });
    jest
      .mocked(fishVoices.resolveVoiceReferenceId)
      .mockResolvedValue('voice-reference-id');
    const service = new BooksService(
      prisma,
      storageService,
      jobsService,
      ttsModelsService,
      fishVoices,
    );
    jest
      .spyOn(
        service as unknown as BooksServiceInternals,
        'createOrReuseChapterAudioJob',
      )
      .mockResolvedValue({
        audio: {} as Audio,
        job: { id: 'fish-job-id' } as ProcessingJob,
        shouldEnqueue: true,
      });

    await service.queueSelectedChapterAudio('user-id', book.id, [
      firstChapter.id,
    ]);

    expect(jobsService.enqueueChapterSynthesis).toHaveBeenCalledWith(
      'fish-job-id',
      'FISH',
    );
  });

  it("resolves a local model's voice name from its voice id", async () => {
    authorsAll.mockResolvedValue([]);
    chaptersAll.mockResolvedValue([firstChapter]);
    audioFirst.mockResolvedValue({
      id: 'audio-id',
      chapterId: firstChapter.id,
      modelKey: 'local.qwen3-tts-0-6b',
      voice: 'ryan',
      status: 'READY',
      processingStage: null,
      totalChunks: 1,
      completedChunks: 1,
      error: null,
    } as Audio);
    jest.mocked(fishVoices.getVoices).mockResolvedValue([]);
    const service = new BooksService(
      prisma,
      storageService,
      jobsService,
      ttsModelsService,
      fishVoices,
    );

    await expect(
      service.getVoiceNamesByReferenceId('user-id'),
    ).resolves.toEqual(new Map([['ryan', 'Ryan']]));
  });

  it("resolves a chapter audio's voice name alongside its snapshotted voice id", async () => {
    authorsAll.mockResolvedValue([]);
    chaptersAll.mockResolvedValue([firstChapter]);
    audioFirst.mockResolvedValue({
      id: 'audio-id',
      chapterId: firstChapter.id,
      modelKey: 'fish.s2.1-pro',
      voice: 'voice-reference-id',
      status: 'READY',
      processingStage: null,
      totalChunks: 1,
      completedChunks: 1,
      error: null,
    } as Audio);
    jest.mocked(fishVoices.getVoices).mockResolvedValue([
      {
        id: 'voice-id',
        referenceId: 'voice-reference-id',
        name: 'Sarah',
        source: 'DEFAULT',
        enabled: true,
        selected: false,
      },
    ]);
    const service = new BooksService(
      prisma,
      storageService,
      jobsService,
      ttsModelsService,
      fishVoices,
    );

    await expect(service.getBook('user-id', book.id)).resolves.toMatchObject({
      chapters: [
        {
          id: firstChapter.id,
          audio: expect.objectContaining({
            voice: 'voice-reference-id',
            voiceName: 'Sarah',
          }),
        },
      ],
    });
    expect(fishVoices.getVoices).toHaveBeenCalledWith('user-id');
  });

  it('returns a signed cover URL for an owned book', async () => {
    book.coverObjectKey = 'books/user-id/book-id/cover/original.jpg';
    storage.createDownloadUrl.mockResolvedValue('https://storage.test/cover');
    const service = new BooksService(
      prisma,
      storageService,
      jobsService,
      ttsModelsService,
      fishVoices,
    );

    await expect(
      service.getBookCoverAccess('user-id', book.id),
    ).resolves.toEqual({
      coverUrl: 'https://storage.test/cover',
      expiresInSeconds: 15 * 60,
    });

    expect(db.orm.public.Book.where).toHaveBeenLastCalledWith({
      id: book.id,
      deletedAt: null,
    });
    expect(storage.createDownloadUrl).toHaveBeenCalledWith(book.coverObjectKey);
  });

  it('creates a signed upload URL for the existing cover object', async () => {
    book.coverObjectKey = 'books/user-id/book-id/cover/original.png';
    storage.createUploadUrl.mockResolvedValue('https://storage.test/upload');
    const service = new BooksService(
      prisma,
      storageService,
      jobsService,
      ttsModelsService,
      fishVoices,
    );

    await expect(
      service.createBookCoverUpload('user-id', book.id, {
        mimeType: 'image/png',
        size: 123,
      }),
    ).resolves.toEqual({ uploadUrl: 'https://storage.test/upload' });

    expect(storage.createUploadUrl).toHaveBeenCalledWith(
      book.coverObjectKey,
      'image/png',
    );
  });

  it('confirms an uploaded cover after verifying its storage metadata', async () => {
    book.coverObjectKey = 'books/user-id/book-id/cover/original.png';
    storage.getObjectMetadata.mockResolvedValue({
      contentLength: 123,
      contentType: 'image/png',
      eTag: 'etag',
    });
    const service = new BooksService(
      prisma,
      storageService,
      jobsService,
      ttsModelsService,
      fishVoices,
    );

    await expect(
      service.completeBookCoverUpload('user-id', book.id, {
        mimeType: 'image/png',
        size: 123,
      }),
    ).resolves.toBeUndefined();

    expect(storage.getObjectMetadata).toHaveBeenCalledWith(book.coverObjectKey);
    expect(bookUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        coverObjectKey: book.coverObjectKey,
        coverMimeType: 'image/png',
        coverSize: 123,
      }),
    );
  });

  describe('public/private visibility and library sharing', () => {
    it('lets a non-owner read a public book, marked as not their own', async () => {
      book.visibility = 'PUBLIC';

      await expect(
        createService().getBook(otherUserId, book.id),
      ).resolves.toMatchObject({
        book: { isOwner: false, isAdded: false, visibility: 'PUBLIC' },
      });
    });

    it('refuses a non-owner reading a private book, same as not found', async () => {
      book.visibility = 'PRIVATE';

      await expect(
        createService().getBook(otherUserId, book.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("lets a non-owner stream a public book chapter's ready audio", async () => {
      book.visibility = 'PUBLIC';
      const chapterFirst = jest.fn().mockResolvedValue(firstChapter);
      db.orm.public.Chapter.where.mockReturnValue({
        first: chapterFirst,
        all: chaptersAll,
      });
      audioFirst.mockResolvedValue({
        status: 'READY',
        objectKey: 'audio-key',
      });
      storage.createDownloadUrl.mockResolvedValue('https://storage.test/audio');

      await expect(
        createService().getChapterAudioAccess(
          otherUserId,
          book.id,
          firstChapter.id,
        ),
      ).resolves.toMatchObject({ playbackUrl: 'https://storage.test/audio' });
    });

    it('rejects making a non-ready book public', async () => {
      book.parseStatus = 'PROCESSING';

      await expect(
        createService().updateVisibility('user-id', book.id, {
          visibility: 'PUBLIC',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      book.parseStatus = 'READY';
    });

    it("keeps other users' library entries when a book goes private", async () => {
      book.visibility = 'PUBLIC';
      bookUpdate.mockResolvedValue({ ...book, visibility: 'PRIVATE' });

      await createService().updateVisibility('user-id', book.id, {
        visibility: 'PRIVATE',
      });

      expect(libraryEntryDeleteAndCount).not.toHaveBeenCalled();
    });

    it("refuses to add a private book to another user's library", async () => {
      book.visibility = 'PRIVATE';

      await expect(
        createService().addToLibrary(otherUserId, book.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to add your own book to your own library', async () => {
      book.visibility = 'PUBLIC';

      await expect(
        createService().addToLibrary('user-id', book.id),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('adding an already-added public book is a no-op, not an error', async () => {
      book.visibility = 'PUBLIC';
      libraryEntryFirst.mockResolvedValue({
        id: 'entry-id',
        userId: otherUserId,
        bookId: book.id,
      } as BookLibraryEntry);

      await createService().addToLibrary(otherUserId, book.id);

      expect(libraryEntryCreate).not.toHaveBeenCalled();
    });

    it("adds a public book to another user's library", async () => {
      book.visibility = 'PUBLIC';

      await createService().addToLibrary(otherUserId, book.id);

      expect(libraryEntryCreate).toHaveBeenCalledWith(
        expect.objectContaining({ userId: otherUserId, bookId: book.id }),
      );
    });

    it('removing a library entry is idempotent', async () => {
      await createService().removeFromLibrary(otherUserId, book.id);

      expect(libraryEntryDeleteAndCount).toHaveBeenCalled();
    });

    it('refuses to copy a private book', async () => {
      book.visibility = 'PRIVATE';

      await expect(
        createService().copyBook(otherUserId, book.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to copy your own book', async () => {
      book.visibility = 'PUBLIC';

      await expect(
        createService().copyBook('user-id', book.id),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('copies a public book into a new, independently owned book', async () => {
      book.visibility = 'PUBLIC';

      const result = await createService().copyBook(otherUserId, book.id);

      expect(storage.copyObject).toHaveBeenCalledWith(
        book.sourceObjectKey,
        expect.stringContaining(`books/${otherUserId}/`),
      );
      expect(bookCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: otherUserId,
          sourceOriginalFilename: book.sourceOriginalFilename,
          parseStatus: 'QUEUED',
        }),
      );
      expect(jobCreate).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'PARSE_BOOK' }),
      );
      expect(jobsService.enqueueBookParsing).toHaveBeenCalled();
      expect(result).toMatchObject({ parseStatus: 'QUEUED' });
      expect(result.bookId).not.toBe(book.id);
    });

    it('lists only owned books when filtered to source=owned', async () => {
      await createService().listBooks('user-id', { source: 'owned' });

      expect(libraryEntryAll).not.toHaveBeenCalled();
    });

    it('lists added books by joining through the library entries', async () => {
      libraryEntryAll.mockResolvedValue([
        { id: 'entry-id', userId: 'user-id', bookId: 'added-book-id' },
      ] as BookLibraryEntry[]);
      const addedBook = {
        ...book,
        id: 'added-book-id',
        userId: otherUserId,
        visibility: 'PUBLIC',
      } as Book;
      db.orm.public.Book.where.mockImplementation(
        (criteria: Record<string, unknown> | ((row: unknown) => unknown)) => {
          if (typeof criteria === 'function') {
            return { all: jest.fn().mockResolvedValue([addedBook]) };
          }

          return { first: bookFirst, all: jest.fn().mockResolvedValue([]) };
        },
      );

      await expect(
        createService().listBooks('user-id', { source: 'added' }),
      ).resolves.toMatchObject({
        books: [{ id: 'added-book-id', isOwner: false, isAdded: true }],
      });
    });

    describe('ghosts', () => {
      const privateAddedBook = {
        ...book,
        id: 'private-added-book-id',
        title: 'Private title',
        userId: otherUserId,
        visibility: 'PRIVATE',
      } as Book;

      beforeEach(() => {
        libraryEntryAll.mockResolvedValue([
          { id: 'entry-id', userId: 'user-id', bookId: privateAddedBook.id },
        ] as BookLibraryEntry[]);
        db.orm.public.Book.where.mockImplementation(
          (criteria: Record<string, unknown> | ((row: unknown) => unknown)) => {
            if (typeof criteria === 'function') {
              return { all: jest.fn().mockResolvedValue([privateAddedBook]) };
            }

            return { first: bookFirst, all: jest.fn().mockResolvedValue([]) };
          },
        );
      });

      it('returns a private added book as a ghost with only its id and title', async () => {
        const result = await createService().listBooks('user-id', {
          source: 'all',
        });

        expect(result.books).toEqual([]);
        expect(result.ghosts).toEqual([
          { bookId: privateAddedBook.id, title: 'Private title' },
        ]);
      });

      it('returns no ghosts when filtered to source=owned', async () => {
        const result = await createService().listBooks('user-id', {
          source: 'owned',
        });

        expect(result.ghosts).toEqual([]);
      });
    });

    it('lists only public books on the public browse endpoint', async () => {
      const publicBook = {
        ...book,
        id: 'public-book-id',
        visibility: 'PUBLIC',
      };
      db.orm.public.Book.where.mockReturnValue({
        all: jest.fn().mockResolvedValue([publicBook]),
      });

      await expect(
        createService().listPublicBooks(otherUserId, {}),
      ).resolves.toMatchObject({
        books: [{ id: 'public-book-id', visibility: 'PUBLIC' }],
      });
      expect(db.orm.public.Book.where).toHaveBeenCalledWith({
        visibility: 'PUBLIC',
        deletedAt: null,
      });
    });

    it('filters the public browse listing by a case-insensitive title match', async () => {
      const matching = {
        ...book,
        id: 'matching-id',
        title: 'The Great Adventure',
      };
      const nonMatching = { ...book, id: 'other-id', title: 'Cooking Basics' };
      db.orm.public.Book.where.mockReturnValue({
        all: jest.fn().mockResolvedValue([matching, nonMatching]),
      });

      await expect(
        createService().listPublicBooks(otherUserId, { search: 'great' }),
      ).resolves.toMatchObject({
        books: [{ id: 'matching-id' }],
      });
    });
  });

  describe('a book that is being deleted', () => {
    const createService = () =>
      new BooksService(
        prisma,
        storageService,
        jobsService,
        ttsModelsService,
        fishVoices,
      );

    beforeEach(() => {
      db.orm.public.Book.where.mockImplementation(
        (criteria: Record<string, unknown>) => ({
          first: jest
            .fn()
            .mockResolvedValue(
              criteria.deletedAt === null
                ? null
                : { ...book, coverObjectKey: 'cover-key', deletedAt: 'now' },
            ),
          update: bookUpdate,
        }),
      );
    });

    it.each<[string, (service: BooksService) => Promise<unknown>]>([
      ['getBook', (service) => service.getBook('user-id', 'book-id')],
      [
        'completeUpload',
        (service) => service.completeUpload('user-id', 'book-id'),
      ],
      [
        'queueChapterAudio',
        (service) =>
          service.queueChapterAudio('user-id', 'book-id', 'chapter-id', null),
      ],
      [
        'queueSelectedChapterAudio',
        (service) =>
          service.queueSelectedChapterAudio('user-id', 'book-id', [
            firstChapter.id,
          ]),
      ],
      [
        'cancelChapterAudio',
        (service) =>
          service.cancelChapterAudio('user-id', 'book-id', 'chapter-id'),
      ],
      [
        'deleteChapterAudio',
        (service) =>
          service.deleteChapterAudio('user-id', 'book-id', 'chapter-id'),
      ],
      [
        'getChapterAudioAccess',
        (service) =>
          service.getChapterAudioAccess('user-id', 'book-id', 'chapter-id'),
      ],
      [
        'getBookCoverAccess',
        (service) => service.getBookCoverAccess('user-id', 'book-id'),
      ],
      [
        'createBookCoverUpload',
        (service) =>
          service.createBookCoverUpload('user-id', 'book-id', {
            mimeType: 'image/png',
            size: 1,
          }),
      ],
    ])('%s treats it as not found', async (_name, call) => {
      await expect(call(createService())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('is left out of the library list', async () => {
      const all = jest.fn().mockResolvedValue([]);
      db.orm.public.Book.where.mockReturnValue({ all });

      await createService().listBooks('user-id', {});

      expect(db.orm.public.Book.where).toHaveBeenCalledWith({
        userId: 'user-id',
        deletedAt: null,
      });
    });
  });
});

import type { JobsService } from '../jobs/jobs.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import type { FishVoiceService } from '../tts-models/fish-voice.service.js';
import type { TtsModelsService } from '../tts-models/tts-models.service.js';
import type {
  Audio,
  Book,
  BookAuthor,
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
  const book = {
    id: 'book-id',
    userId: 'user-id',
    coverObjectKey: null,
    parseStatus: 'READY',
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
  const db = {
    orm: {
      public: {
        Audio: { where: jest.fn() },
        Book: { where: jest.fn() },
        BookAuthor: { where: jest.fn() },
        Chapter: { where: jest.fn() },
      },
    },
  };
  const prisma = {
    db,
  } as unknown as PrismaService;
  const jobsService = {
    enqueueChapterSynthesis: jest.fn().mockResolvedValue(undefined),
  } as unknown as JobsService;
  const storage = {
    createDownloadUrl: jest.fn(),
    createUploadUrl: jest.fn(),
    getObjectMetadata: jest.fn(),
  };
  const storageService = storage as unknown as StorageService;
  const ttsModelsService = {
    getSelectableModel: jest.fn(),
  } as unknown as TtsModelsService;
  const fishVoices = {
    resolveVoiceReferenceId: jest.fn(),
  } as unknown as FishVoiceService;

  beforeEach(() => {
    jest.clearAllMocks();
    book.coverObjectKey = null;
    bookFirst.mockResolvedValue(book);
    chaptersAll.mockResolvedValue([secondChapter, firstChapter]);
    audioFirst.mockResolvedValue(null);
    db.orm.public.Book.where.mockReturnValue({
      first: bookFirst,
      update: bookUpdate,
    });
    db.orm.public.Chapter.where.mockReturnValue({ all: chaptersAll });
    db.orm.public.BookAuthor.where.mockReturnValue({ all: authorsAll });
    db.orm.public.Audio.where.mockReturnValue({ first: audioFirst });
    jest.mocked(ttsModelsService.getSelectableModel).mockResolvedValue({
      id: 'local.piper.en-us-amy',
      source: 'LOCAL',
      providerModel: null,
    });
  });

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
      createdAt: '2026-10-31T00:00:00.000Z',
      updatedAt: '2026-10-31T00:00:00.000Z',
    } as Book;
    const secondListedBook = {
      ...firstListedBook,
      id: 'second-book-id',
      title: 'Second book',
      sourceOriginalFilename: 'second.epub',
    } as Book;
    const orderBy = jest.fn();
    const offset = jest.fn();
    const limit = jest.fn();
    const all = jest
      .fn()
      .mockResolvedValue([firstListedBook, secondListedBook]);

    orderBy.mockReturnValue({ offset });
    offset.mockReturnValue({ limit });
    limit.mockReturnValue({ all });
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
        return { orderBy };
      }

      return { first: bookFirst, update: bookUpdate };
    });

    const service = new BooksService(
      prisma,
      storageService,
      jobsService,
      ttsModelsService,
      fishVoices,
    );

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
    );
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
      userId: 'user-id',
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
});

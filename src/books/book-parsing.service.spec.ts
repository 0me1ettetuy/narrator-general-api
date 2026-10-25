import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import type { EpubParserService } from './epub-parser.service.js';

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../storage/storage.service.js', () => ({
  StorageService: class StorageService {},
}));

jest.mock('./epub-parser.service.js', () => ({
  EpubParserService: class EpubParserService {},
}));

import { BookParsingService } from './book-parsing.service.js';

describe('BookParsingService', () => {
  const parseJob = {
    id: 'parse-job-id',
    bookId: 'book-id',
    type: 'PARSE_BOOK',
    status: 'QUEUED',
    attempts: 0,
    maxAttempts: 3,
  };
  const book = {
    id: 'book-id',
    userId: 'user-id',
    sourceObjectKey: 'books/user-id/book-id/source/original.epub',
    sourceSize: 123,
  };
  let shouldFindProcessingBook = true;
  const jobUpdate = jest.fn().mockResolvedValue(undefined);
  const bookUpdate = jest.fn().mockResolvedValue(undefined);
  const chapterCreate = jest.fn().mockResolvedValue(undefined);
  const storageService = {
    deleteObject: jest.fn().mockResolvedValue(undefined),
    getObjectBytes: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    putObjectBytes: jest.fn().mockResolvedValue(undefined),
  } as unknown as StorageService;
  const epubParserService = {
    parse: jest.fn(),
  } as unknown as EpubParserService;
  const db: {
    transaction: jest.Mock;
    orm: {
      public: {
        Book: { where: jest.Mock };
        BookAuthor: { create: jest.Mock };
        Chapter: { create: jest.Mock };
        Job: { where: jest.Mock };
      };
    };
  } = {
    transaction: jest.fn(),
    orm: {
      public: {
        Book: { where: jest.fn() },
        BookAuthor: { create: jest.fn() },
        Chapter: { create: jest.fn() },
        Job: { where: jest.fn() },
      },
    },
  };
  const prisma = { db } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    shouldFindProcessingBook = true;
    db.transaction.mockImplementation(async (callback) => callback(db));
    db.orm.public.Job.where.mockImplementation(
      (where: { status?: string; type?: string }) => ({
        first: jest
          .fn()
          .mockResolvedValue(
            where.type === 'PARSE_BOOK' && where.status === 'QUEUED'
              ? parseJob
              : null,
          ),
        update: jobUpdate,
      }),
    );
    db.orm.public.Book.where.mockImplementation(
      (where: { parseStatus?: string }) => ({
        first: jest
          .fn()
          .mockResolvedValue(
            where.parseStatus === 'QUEUED' ||
              (where.parseStatus === 'PROCESSING' && shouldFindProcessingBook)
              ? book
              : null,
          ),
        update: bookUpdate,
      }),
    );
    db.orm.public.BookAuthor.create.mockResolvedValue(undefined);
    chapterCreate.mockResolvedValue(undefined);
    db.orm.public.Chapter.create = chapterCreate;
    jest.mocked(epubParserService.parse).mockReturnValue({
      title: 'Parsed title',
      authors: [],
      cover: {
        bytes: new Uint8Array([4, 5, 6]),
        mimeType: 'image/png',
      },
      chapters: [
        {
          position: 0,
          title: 'Chapter one',
          sourceHref: 'chapter-1.xhtml',
          text: 'Chapter text',
          wordCount: 2,
        },
      ],
    });
  });

  it('stores an extracted cover before marking the parsed book ready', async () => {
    const service = new BookParsingService(
      prisma,
      storageService,
      epubParserService,
    );

    await expect(service.parse(parseJob.id)).resolves.toEqual({
      id: parseJob.id,
      bookId: book.id,
      userId: book.userId,
      sourceObjectKey: book.sourceObjectKey,
      sourceSize: book.sourceSize,
      maxAttempts: parseJob.maxAttempts,
    });

    expect(storageService.putObjectBytes).toHaveBeenCalledWith(
      'books/user-id/book-id/cover/original.png',
      new Uint8Array([4, 5, 6]),
      'image/png',
    );
    expect(bookUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        coverObjectKey: 'books/user-id/book-id/cover/original.png',
        coverMimeType: 'image/png',
        coverSize: 3,
        parseStatus: 'READY',
      }),
    );
  });

  it('removes the uploaded cover when the parsed book cannot be persisted', async () => {
    shouldFindProcessingBook = false;
    const service = new BookParsingService(
      prisma,
      storageService,
      epubParserService,
    );

    await expect(service.parse(parseJob.id)).rejects.toThrow(
      'Book is no longer being parsed',
    );

    expect(storageService.deleteObject).toHaveBeenCalledWith(
      'books/user-id/book-id/cover/original.png',
    );
  });
});

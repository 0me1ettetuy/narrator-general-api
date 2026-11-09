import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import type { EpubParserService } from './epub-parser.service.js';
import type { ParsedEpub } from './types/parsed-epub.type.js';

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
  let deletedBeforeFinalSave = false;
  let parsedEpub: ParsedEpub;
  const jobUpdate = jest.fn().mockResolvedValue(undefined);
  const bookUpdate = jest.fn().mockImplementation(() => Promise.resolve(book));
  const chapterCreate = jest.fn().mockResolvedValue(undefined);
  const storageService = {
    deleteObject: jest.fn().mockResolvedValue(undefined),
    deleteObjects: jest.fn().mockResolvedValue(undefined),
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
        BookImage: { create: jest.Mock };
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
        BookImage: { create: jest.fn() },
        Chapter: { create: jest.fn() },
        Job: { where: jest.fn() },
      },
    },
  };
  const prisma = { db } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    shouldFindProcessingBook = true;
    deletedBeforeFinalSave = false;
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
      (where: { parseStatus?: string; deletedAt?: null }) => ({
        first: jest
          .fn()
          .mockResolvedValue(
            where.parseStatus === 'QUEUED' ||
              (where.parseStatus === 'PROCESSING' && shouldFindProcessingBook)
              ? book
              : null,
          ),
        update:
          deletedBeforeFinalSave &&
          where.parseStatus === 'PROCESSING' &&
          where.deletedAt === null
            ? jest.fn().mockResolvedValue(null)
            : bookUpdate,
      }),
    );
    db.orm.public.BookAuthor.create.mockResolvedValue(undefined);
    db.orm.public.BookImage.create.mockResolvedValue(undefined);
    chapterCreate.mockResolvedValue(undefined);
    db.orm.public.Chapter.create = chapterCreate;
    parsedEpub = {
      title: 'Parsed title',
      language: 'en-US',
      authors: [],
      images: [],
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
          semanticTypes: [],
          isLinear: true,
        },
      ],
    };
    jest.mocked(epubParserService.parse).mockReturnValue(parsedEpub);
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
        language: 'en-US',
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

  it('does not mark a book ready when it is deleted during the final save', async () => {
    deletedBeforeFinalSave = true;
    const service = new BookParsingService(
      prisma,
      storageService,
      epubParserService,
    );

    await expect(service.parse(parseJob.id)).rejects.toThrow(
      'Book is no longer being parsed',
    );

    expect(bookUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ parseStatus: 'READY' }),
    );
    expect(storageService.deleteObject).toHaveBeenCalledWith(
      'books/user-id/book-id/cover/original.png',
    );
  });
  describe('images', () => {
    const mapId = '0b9c1f52-3a4e-4d6a-9b1e-2f7c8d9e0a11';
    const photoId = '7d2e4a90-1c3b-4f58-8a6d-5e9f0b1c2d33';
    const mapKey = `books/user-id/book-id/images/${mapId}.png`;
    const photoKey = `books/user-id/book-id/images/${photoId}.jpg`;

    beforeEach(() => {
      parsedEpub.images = [
        {
          id: mapId,
          bytes: new Uint8Array([7, 8]),
          mimeType: 'image/png',
          alt: 'Map',
        },
        {
          id: photoId,
          bytes: new Uint8Array([9]),
          mimeType: 'image/jpeg',
          alt: null,
        },
      ];
    });

    it('uploads every image and saves a row for each', async () => {
      const service = new BookParsingService(
        prisma,
        storageService,
        epubParserService,
      );

      await service.parse(parseJob.id);

      expect(storageService.putObjectBytes).toHaveBeenCalledWith(
        mapKey,
        new Uint8Array([7, 8]),
        'image/png',
      );
      expect(storageService.putObjectBytes).toHaveBeenCalledWith(
        photoKey,
        new Uint8Array([9]),
        'image/jpeg',
      );
      expect(db.orm.public.BookImage.create).toHaveBeenCalledWith({
        id: mapId,
        bookId: 'book-id',
        objectKey: mapKey,
        mimeType: 'image/png',
        size: 2,
        alt: 'Map',
      });
      expect(db.orm.public.BookImage.create).toHaveBeenCalledWith({
        id: photoId,
        bookId: 'book-id',
        objectKey: photoKey,
        mimeType: 'image/jpeg',
        size: 1,
        alt: null,
      });
    });

    it('removes the uploaded images when the parsed book cannot be persisted', async () => {
      shouldFindProcessingBook = false;
      const service = new BookParsingService(
        prisma,
        storageService,
        epubParserService,
      );

      await expect(service.parse(parseJob.id)).rejects.toThrow(
        'Book is no longer being parsed',
      );

      expect(storageService.deleteObjects).toHaveBeenCalledWith([
        mapKey,
        photoKey,
      ]);
    });

    it('leaves image storage alone for a book without images', async () => {
      parsedEpub.images = [];
      shouldFindProcessingBook = false;
      const service = new BookParsingService(
        prisma,
        storageService,
        epubParserService,
      );

      await expect(service.parse(parseJob.id)).rejects.toThrow();

      expect(storageService.putObjectBytes).toHaveBeenCalledTimes(1);
      expect(storageService.deleteObjects).not.toHaveBeenCalled();
      expect(db.orm.public.BookImage.create).not.toHaveBeenCalled();
    });
  });
});

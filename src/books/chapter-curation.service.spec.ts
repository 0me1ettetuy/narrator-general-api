import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import type { BooksService } from './books.service.js';
import type { Book, Chapter } from './types/book.type.js';

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../storage/storage.service.js', () => ({
  StorageService: class StorageService {},
}));

jest.mock('./books.service.js', () => ({
  BooksService: class BooksService {},
}));

import { ChapterCurationService } from './chapter-curation.service.js';

describe('ChapterCurationService', () => {
  const book = {
    id: 'book-id',
    userId: 'user-id',
  } as Book;
  const chapters = [
    {
      id: 'first-chapter-id',
      bookId: book.id,
      position: 0,
      removedAt: null,
    },
    {
      id: 'second-chapter-id',
      bookId: book.id,
      position: 1,
      removedAt: null,
    },
  ] as Chapter[];
  const bookFirst = jest.fn().mockResolvedValue(book);
  const chaptersAll = jest.fn().mockResolvedValue(chapters);
  const chapterUpdate = jest.fn().mockResolvedValue(undefined);
  const db = {
    transaction: jest.fn(),
    orm: {
      public: {
        Audio: { where: jest.fn() },
        Book: { where: jest.fn() },
        BookImage: { where: jest.fn() },
        Chapter: { where: jest.fn() },
      },
    },
  };
  const prisma = { db } as unknown as PrismaService;
  const booksService = {
    getVoiceNamesByReferenceId: jest.fn().mockResolvedValue(new Map()),
  } as unknown as BooksService;
  const storageService = {
    createDownloadUrl: jest.fn((key: string) =>
      Promise.resolve(`https://storage.test/${key}?signed`),
    ),
  } as unknown as StorageService;

  beforeEach(() => {
    jest.clearAllMocks();
    db.transaction.mockImplementation(async (callback) => callback(db));
    db.orm.public.Book.where.mockReturnValue({ first: bookFirst });
    db.orm.public.Chapter.where.mockReturnValue({
      all: chaptersAll,
      update: chapterUpdate,
    });
  });

  it('persists a batch role and narration override without touching audio', async () => {
    const service = new ChapterCurationService(
      prisma,
      booksService,
      storageService,
    );

    await expect(
      service.updateSelection('user-id', book.id, {
        chapterIds: [chapters[1].id, chapters[0].id],
        role: 'NAVIGATION',
        includeInDefaultNarration: false,
      }),
    ).resolves.toEqual({
      updatedChapterIds: [chapters[0].id, chapters[1].id],
    });

    expect(chapterUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        role: 'NAVIGATION',
        includeInDefaultNarration: false,
        classificationSource: 'USER',
        classificationReason: 'USER_OVERRIDE',
      }),
    );
    expect(chapterUpdate).toHaveBeenCalledTimes(2);
  });

  it('refuses to curate a book that is being deleted', async () => {
    db.orm.public.Book.where.mockImplementation(
      (criteria: Record<string, unknown>) => ({
        first: jest
          .fn()
          .mockResolvedValue(
            criteria.deletedAt === null ? null : { ...book, deletedAt: 'now' },
          ),
      }),
    );
    const service = new ChapterCurationService(
      prisma,
      booksService,
      storageService,
    );

    await expect(
      service.updateSelection('user-id', book.id, {
        chapterIds: [chapters[0].id],
        role: 'NAVIGATION',
        includeInDefaultNarration: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(chapterUpdate).not.toHaveBeenCalled();
  });
  describe('chapter images', () => {
    const mapId = '0b9c1f52-3a4e-4d6a-9b1e-2f7c8d9e0a11';
    const photoId = '7d2e4a90-1c3b-4f58-8a6d-5e9f0b1c2d33';
    const foreignId = '5a1f3c77-9d20-4b8e-8f44-1c6d7e8f9a00';
    const imageRows = [
      { id: photoId, bookId: book.id, objectKey: 'k/photo.jpg', alt: null },
      { id: mapId, bookId: book.id, objectKey: 'k/map.png', alt: 'Map' },
    ];
    const imageAll = jest.fn();

    function chapterWithText(text: string) {
      return {
        ...chapters[0],
        title: 'One',
        text,
        wordCount: 1,
        role: 'MAIN',
        includeInDefaultNarration: true,
        classificationSource: 'EPUB',
        classificationConfidence: null,
        classificationReason: null,
        origin: 'IMPORTED',
      };
    }

    beforeEach(() => {
      imageAll.mockResolvedValue(imageRows);
      db.orm.public.BookImage.where.mockReturnValue({ all: imageAll });
      db.orm.public.Audio.where.mockReturnValue({
        first: jest.fn().mockResolvedValue(null),
      });
    });

    function useChapterText(text: string) {
      db.orm.public.Chapter.where.mockReturnValue({
        first: jest.fn().mockResolvedValue(chapterWithText(text)),
      });
    }

    it('returns signed urls for the images named in the text, in text order', async () => {
      useChapterText(
        `Start [[img_${mapId}]] mid\n\n[[img_${photoId}]] [[img_${mapId}]]`,
      );
      const service = new ChapterCurationService(
        prisma,
        booksService,
        storageService,
      );

      const detail = await service.getChapter(
        'user-id',
        book.id,
        chapters[0].id,
      );

      expect(detail.images).toEqual([
        { id: mapId, url: 'https://storage.test/k/map.png?signed', alt: 'Map' },
        {
          id: photoId,
          url: 'https://storage.test/k/photo.jpg?signed',
          alt: null,
        },
      ]);
      expect(db.orm.public.BookImage.where).toHaveBeenCalledWith({
        bookId: book.id,
      });
    });

    it('ignores a marker that names no image of this book', async () => {
      useChapterText(`Text [[img_${foreignId}]] [[img_${mapId}]]`);
      const service = new ChapterCurationService(
        prisma,
        booksService,
        storageService,
      );

      const detail = await service.getChapter(
        'user-id',
        book.id,
        chapters[0].id,
      );

      expect(detail.images.map((image) => image.id)).toEqual([mapId]);
    });

    it('does not look up images for a chapter without markers', async () => {
      useChapterText('Plain text');
      const service = new ChapterCurationService(
        prisma,
        booksService,
        storageService,
      );

      const detail = await service.getChapter(
        'user-id',
        book.id,
        chapters[0].id,
      );

      expect(detail.images).toEqual([]);
      expect(db.orm.public.BookImage.where).not.toHaveBeenCalled();
      expect(storageService.createDownloadUrl).not.toHaveBeenCalled();
    });
  });
});

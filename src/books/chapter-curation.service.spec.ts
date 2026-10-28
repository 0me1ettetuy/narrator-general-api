import type { PrismaService } from '../prisma/prisma.service.js';
import type { BooksService } from './books.service.js';
import type { Book, Chapter } from './types/book.type.js';

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
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
        Chapter: { where: jest.fn() },
      },
    },
  };
  const prisma = { db } as unknown as PrismaService;
  const booksService = {} as BooksService;

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
    const service = new ChapterCurationService(prisma, booksService);

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
});

import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { temporalFromEpochMilliseconds } from '../prisma/temporal.js';

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

import { CollectionsService } from './collections.service.js';

type Row = Record<string, unknown>;
type Filter = Row | ((fields: never) => boolean);

// In-memory stand-in for the Prisma Next table API used by the service.
function createTable(rows: Row[]) {
  const matches = (filter: Filter) => (row: Row) =>
    typeof filter === 'function'
      ? (filter as (fields: unknown) => boolean)(
          new Proxy(
            {},
            {
              get: (_, key: string) => ({
                in: (values: unknown[]) => values.includes(row[key]),
              }),
            },
          ),
        )
      : Object.entries(filter).every(([key, value]) => row[key] === value);

  return {
    rows,
    create: async (row: Row) => {
      rows.push(row);
      return row;
    },
    where: (filter: Filter) => ({
      all: async () => rows.filter(matches(filter)),
      first: async () => rows.find(matches(filter)) ?? null,
      update: async (patch: Row) => {
        const row = rows.find(matches(filter));
        if (row) Object.assign(row, patch);
        return row ?? null;
      },
      deleteAndCount: async () => {
        const removed = rows.filter(matches(filter));
        for (const row of removed) rows.splice(rows.indexOf(row), 1);
        return removed.length;
      },
    }),
  };
}

const at = (epochMilliseconds: number) =>
  temporalFromEpochMilliseconds(epochMilliseconds);

describe('CollectionsService', () => {
  let db: {
    orm: { public: Record<string, ReturnType<typeof createTable>> };
    transaction: (callback: (tx: typeof db) => unknown) => unknown;
  };
  let service: CollectionsService;

  const bookRow = (
    id: string,
    userId: string,
    visibility: 'PUBLIC' | 'PRIVATE',
    extra: Row = {},
  ): Row => ({
    id,
    userId,
    title: id,
    language: null,
    sourceFormat: 'EPUB',
    sourceObjectKey: `books/${userId}/${id}/source.epub`,
    sourceOriginalFilename: `${id}.epub`,
    sourceMimeType: 'application/epub+zip',
    sourceSize: 1,
    coverObjectKey: null,
    parseStatus: 'READY',
    visibility,
    chapterCount: 0,
    deletedAt: null,
    createdAt: at(1000),
    updatedAt: at(1000),
    ...extra,
  });

  const link = (collectionId: string, bookId: string, position: number) =>
    db.orm.public.CollectionBook.rows.push({
      id: `${collectionId}-${bookId}`,
      collectionId,
      bookId,
      position,
      createdAt: at(1000),
    });

  beforeEach(() => {
    const tables = {
      Book: createTable([
        bookRow('book-own-private', 'owner', 'PRIVATE', {
          coverObjectKey: 'cover',
        }),
        bookRow('book-own-public', 'owner', 'PUBLIC'),
        bookRow('book-other-public', 'other', 'PUBLIC'),
        bookRow('book-other-private', 'other', 'PRIVATE'),
      ]),
      BookAuthor: createTable([]),
      BookLibraryEntry: createTable([]),
      Collection: createTable([
        {
          id: 'collection-1',
          userId: 'owner',
          title: 'Dune',
          description: null,
          visibility: 'PRIVATE',
          createdAt: at(1000),
          updatedAt: at(1000),
        },
      ]),
      CollectionBook: createTable([]),
      CollectionLibraryEntry: createTable([]),
    };
    db = {
      orm: { public: tables },
      transaction: (callback) => callback(db),
    };
    service = new CollectionsService({ db } as unknown as PrismaService);
  });

  describe('getCollection', () => {
    it('returns 404 for a non-owner of a private collection', async () => {
      await expect(
        service.getCollection('stranger', 'collection-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("gives the owner a ghost for another user's private book", async () => {
      link('collection-1', 'book-other-private', 0);

      const result = await service.getCollection('owner', 'collection-1');

      expect(result.books[0]).toEqual({
        bookId: 'book-other-private',
        title: 'book-other-private',
        position: 0,
        isGhost: true,
        book: null,
      });
      expect(result.collection.bookCount).toBe(0);
    });

    it('hides private books from other viewers of a public collection', async () => {
      db.orm.public.Collection.rows[0].visibility = 'PUBLIC';
      link('collection-1', 'book-own-private', 0);
      link('collection-1', 'book-own-public', 1);

      const result = await service.getCollection('stranger', 'collection-1');

      expect(result.books.map((entry) => entry.bookId)).toEqual([
        'book-own-public',
      ]);
      expect(result.collection.bookCount).toBe(1);
      expect(result.collection.coverBookId).toBeNull();
    });

    it('skips a book that is being deleted', async () => {
      link('collection-1', 'book-own-public', 0);
      db.orm.public.Book.rows[1].deletedAt = at(2000);

      const result = await service.getCollection('owner', 'collection-1');

      expect(result.books).toEqual([]);
    });
  });

  describe('listPublicCollections', () => {
    it('hides a public collection with no public books', async () => {
      db.orm.public.Collection.rows[0].visibility = 'PUBLIC';
      link('collection-1', 'book-own-private', 0);

      const result = await service.listPublicCollections('owner', {});

      expect(result.collections).toEqual([]);
    });

    it('matches search case-insensitively', async () => {
      db.orm.public.Collection.rows[0].visibility = 'PUBLIC';
      link('collection-1', 'book-own-public', 0);

      const result = await service.listPublicCollections('stranger', {
        search: 'dUnE',
      });

      expect(result.collections).toHaveLength(1);
    });
  });

  describe('listCollections', () => {
    it('returns a saved private collection as a ghost using the snapshot', async () => {
      db.orm.public.CollectionLibraryEntry.rows.push({
        id: 'entry-1',
        userId: 'stranger',
        collectionId: 'collection-1',
        titleSnapshot: 'Saved title',
        createdAt: at(1000),
      });

      const result = await service.listCollections('stranger', {
        source: 'all',
      });

      expect(result.collections).toEqual([]);
      expect(result.ghosts).toEqual([
        { collectionId: 'collection-1', title: 'Saved title' },
      ]);
    });

    it('reports containsBook when bookId is passed', async () => {
      link('collection-1', 'book-own-public', 0);

      const result = await service.listCollections('owner', {
        source: 'owned',
        bookId: 'book-own-public',
      });

      expect(result.collections[0].containsBook).toBe(true);
    });
  });

  describe('createCollection', () => {
    it('always creates a private collection', async () => {
      const result = await service.createCollection('owner', {
        title: 'Lord of the Rings',
      });

      expect(result).toMatchObject({
        title: 'Lord of the Rings',
        visibility: 'PRIVATE',
        isOwner: true,
        bookCount: 0,
      });
      expect(db.orm.public.Collection.rows).toHaveLength(2);
    });
  });

  describe('deleteCollection', () => {
    it('deletes references but never books', async () => {
      link('collection-1', 'book-own-public', 0);
      db.orm.public.CollectionLibraryEntry.rows.push({
        id: 'entry-1',
        userId: 'stranger',
        collectionId: 'collection-1',
        titleSnapshot: 'Dune',
        createdAt: at(1000),
      });

      await service.deleteCollection('owner', 'collection-1');

      expect(db.orm.public.Collection.rows).toEqual([]);
      expect(db.orm.public.CollectionBook.rows).toEqual([]);
      expect(db.orm.public.CollectionLibraryEntry.rows).toEqual([]);
      expect(db.orm.public.Book.rows).toHaveLength(4);
    });

    it('returns 404 for a non-owner', async () => {
      await expect(
        service.deleteCollection('stranger', 'collection-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

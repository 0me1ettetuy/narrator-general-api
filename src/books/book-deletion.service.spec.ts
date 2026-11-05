import { NotFoundException } from '@nestjs/common';
import type { JobsService } from '../jobs/jobs.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';

jest.mock('../jobs/jobs.service.js', () => ({
  JobsService: class JobsService {},
}));
jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../storage/storage.service.js', () => ({
  StorageService: class StorageService {},
}));

import { BookDeletionService } from './book-deletion.service.js';

type Row = Record<string, unknown>;
type TableName =
  | 'Book'
  | 'BookAuthor'
  | 'BookLibraryEntry'
  | 'CollectionBook'
  | 'Chapter'
  | 'Audio'
  | 'AudioChunk'
  | 'Job';

const FOREIGN_KEYS: Partial<Record<TableName, [TableName, string][]>> = {
  Book: [
    ['BookAuthor', 'bookId'],
    ['BookLibraryEntry', 'bookId'],
    ['CollectionBook', 'bookId'],
    ['Chapter', 'bookId'],
    ['Job', 'bookId'],
  ],
  Chapter: [
    ['Audio', 'chapterId'],
    ['Job', 'chapterId'],
  ],
  Audio: [['AudioChunk', 'audioId']],
};

const columns = new Proxy(
  {},
  {
    get: (_target, column: string) => ({
      in: (values: unknown[]) => (row: Row) => values.includes(row[column]),
    }),
  },
) as Record<string, { in: (values: unknown[]) => (row: Row) => boolean }>;

describe('BookDeletionService', () => {
  let tables: Record<TableName, Row[]>;
  let database: {
    orm: { public: Record<TableName, ReturnType<typeof createTable>> };
  };
  let transaction: jest.Mock;
  let storage: { deleteObjectsByPrefix: jest.Mock };
  let jobs: {
    removeBookParsing: jest.Mock;
    removeChapterSynthesis: jest.Mock;
    removeAudioMerge: jest.Mock;
  };
  let service: BookDeletionService;

  function createTable(name: TableName) {
    return {
      where: (
        criteria: Row | ((row: typeof columns) => (row: Row) => boolean),
      ) => {
        const matches =
          typeof criteria === 'function'
            ? criteria(columns)
            : (row: Row) =>
                Object.entries(criteria).every(
                  ([key, value]) => row[key] === value,
                );

        return {
          first: () => Promise.resolve(tables[name].find(matches) ?? null),
          all: () => Promise.resolve(tables[name].filter(matches)),
          update: (data: Row) => {
            const rows = tables[name].filter(matches);
            rows.forEach((row) => Object.assign(row, data));

            return Promise.resolve(rows[0] ?? null);
          },
          deleteAndCount: () => {
            const deleted = tables[name].filter(matches);

            for (const [childTable, column] of FOREIGN_KEYS[name] ?? []) {
              if (
                tables[childTable].some((child) =>
                  deleted.some((row) => row.id === child[column]),
                )
              ) {
                return Promise.reject(
                  new Error(`${childTable}.${column} foreign key violation`),
                );
              }
            }

            tables[name] = tables[name].filter((row) => !matches(row));

            return Promise.resolve(deleted.length);
          },
        };
      },
    };
  }

  function rowsFor(bookId: string) {
    const chapterIds = tables.Chapter.filter(
      (chapter) => chapter.bookId === bookId,
    ).map((chapter) => chapter.id);
    const audioIds = tables.Audio.filter((audio) =>
      chapterIds.includes(audio.chapterId),
    ).map((audio) => audio.id);

    return [
      ...tables.Book.filter((book) => book.id === bookId),
      ...tables.BookAuthor.filter((author) => author.bookId === bookId),
      ...tables.BookLibraryEntry.filter((entry) => entry.bookId === bookId),
      ...tables.CollectionBook.filter((row) => row.bookId === bookId),
      ...tables.Chapter.filter((chapter) => chapter.bookId === bookId),
      ...tables.Job.filter((job) => job.bookId === bookId),
      ...tables.Audio.filter((audio) => audioIds.includes(audio.id)),
      ...tables.AudioChunk.filter((chunk) => audioIds.includes(chunk.audioId)),
    ];
  }

  beforeEach(() => {
    tables = {
      Book: [
        {
          id: 'book-id',
          userId: 'user-id',
          parseStatus: 'READY',
          deletedAt: null,
        },
        {
          id: 'other-book-id',
          userId: 'user-id',
          parseStatus: 'READY',
          deletedAt: null,
        },
      ],
      BookAuthor: [{ id: 'author-id', bookId: 'book-id' }],
      BookLibraryEntry: [
        { id: 'entry-id', userId: 'other-user-id', bookId: 'book-id' },
      ],
      CollectionBook: [
        {
          id: 'collection-book-id',
          collectionId: 'collection-id',
          bookId: 'book-id',
        },
      ],
      Chapter: [
        { id: 'chapter-1', bookId: 'book-id', removedAt: null },
        { id: 'chapter-2', bookId: 'book-id', removedAt: 'removed' },
        { id: 'other-chapter', bookId: 'other-book-id', removedAt: null },
      ],
      Audio: [
        {
          id: 'audio-1',
          chapterId: 'chapter-1',
          status: 'READY',
          objectKey: 'books/user-id/book-id/audio/chapter-1/audio-1.mp3',
        },
        { id: 'other-audio', chapterId: 'other-chapter', status: 'READY' },
      ],
      AudioChunk: [],
      Job: [
        {
          id: 'parse-job',
          bookId: 'book-id',
          chapterId: null,
          type: 'PARSE_BOOK',
          status: 'COMPLETED',
        },
        {
          id: 'tts-job',
          bookId: 'book-id',
          chapterId: 'chapter-1',
          type: 'SYNTHESIZE_CHAPTER',
          status: 'COMPLETED',
        },
      ],
    };
    database = {
      orm: {
        public: {
          Book: createTable('Book'),
          BookAuthor: createTable('BookAuthor'),
          BookLibraryEntry: createTable('BookLibraryEntry'),
          CollectionBook: createTable('CollectionBook'),
          Chapter: createTable('Chapter'),
          Audio: createTable('Audio'),
          AudioChunk: createTable('AudioChunk'),
          Job: createTable('Job'),
        },
      },
    };
    transaction = jest.fn(
      (callback: (transaction: typeof database) => Promise<unknown>) =>
        callback(database),
    );
    storage = { deleteObjectsByPrefix: jest.fn().mockResolvedValue(undefined) };
    jobs = {
      removeBookParsing: jest.fn().mockResolvedValue(undefined),
      removeChapterSynthesis: jest.fn().mockResolvedValue(undefined),
      removeAudioMerge: jest.fn().mockResolvedValue(undefined),
    };
    service = new BookDeletionService(
      { db: { ...database, transaction } } as unknown as PrismaService,
      storage as unknown as StorageService,
      jobs as unknown as JobsService,
    );
  });

  it('deletes a parsed book, its rows, and every object in its storage folder', async () => {
    await service.deleteBook('user-id', 'book-id');

    expect(storage.deleteObjectsByPrefix).toHaveBeenCalledWith(
      'books/user-id/book-id/',
    );
    expect(rowsFor('book-id')).toEqual([]);
    expect(rowsFor('other-book-id')).toHaveLength(3);
  });

  it('stops chapter generation before removing any files', async () => {
    tables.Audio[0].status = 'PROCESSING';
    tables.AudioChunk.push(
      { id: 'chunk-1', audioId: 'audio-1', status: 'READY' },
      { id: 'chunk-2', audioId: 'audio-1', status: 'PROCESSING' },
    );
    tables.Job[1].status = 'PROCESSING';
    tables.Job.push({
      id: 'merge-job',
      bookId: 'book-id',
      chapterId: 'chapter-1',
      type: 'MERGE_CHAPTER_AUDIO',
      status: 'QUEUED',
    });
    let stateWhenFilesWereDeleted: unknown;
    storage.deleteObjectsByPrefix.mockImplementation(() => {
      stateWhenFilesWereDeleted = {
        bookDeleted: tables.Book[0].deletedAt !== null,
        audio: tables.Audio[0].status,
        jobs: tables.Job.map((job) => [job.id, job.status]),
      };

      return Promise.resolve();
    });

    await service.deleteBook('user-id', 'book-id');

    expect(stateWhenFilesWereDeleted).toEqual({
      bookDeleted: true,
      audio: 'DELETING',
      jobs: [
        ['parse-job', 'COMPLETED'],
        ['tts-job', 'CANCELLED'],
        ['merge-job', 'CANCELLED'],
      ],
    });
    expect(jobs.removeChapterSynthesis).toHaveBeenCalledWith('tts-job');
    expect(jobs.removeAudioMerge).toHaveBeenCalledWith('merge-job');
    expect(rowsFor('book-id')).toEqual([]);
  });

  it('cancels a parse that is still running', async () => {
    tables.Book[0].parseStatus = 'PROCESSING';
    tables.Job[0].status = 'PROCESSING';
    let parseJobStatusWhenFilesWereDeleted: unknown;
    storage.deleteObjectsByPrefix.mockImplementation(() => {
      parseJobStatusWhenFilesWereDeleted = tables.Job[0].status;

      return Promise.resolve();
    });

    await service.deleteBook('user-id', 'book-id');

    expect(parseJobStatusWhenFilesWereDeleted).toBe('CANCELLED');
    expect(jobs.removeBookParsing).toHaveBeenCalledWith('parse-job');
    expect(rowsFor('book-id')).toEqual([]);
  });

  it('keeps a book hidden after a failed cleanup and finishes when deletion is retried', async () => {
    storage.deleteObjectsByPrefix.mockRejectedValueOnce(
      new Error('storage unavailable'),
    );

    await expect(service.deleteBook('user-id', 'book-id')).rejects.toThrow(
      'storage unavailable',
    );
    expect(tables.Book[0].deletedAt).not.toBeNull();

    await service.deleteBook('user-id', 'book-id');

    expect(rowsFor('book-id')).toEqual([]);
  });

  it('still deletes the book when removing queued work from Redis fails', async () => {
    tables.Job[1].status = 'QUEUED';
    jobs.removeChapterSynthesis.mockRejectedValue(new Error('redis down'));

    await service.deleteBook('user-id', 'book-id');

    expect(rowsFor('book-id')).toEqual([]);
  });

  it('retries the database cleanup once when a concurrent write makes it fail', async () => {
    const runTransaction = transaction.getMockImplementation() as (
      callback: (transaction: typeof database) => Promise<unknown>,
    ) => Promise<unknown>;
    transaction
      .mockImplementationOnce(runTransaction)
      .mockImplementationOnce(() =>
        Promise.reject(new Error('foreign key violation')),
      );

    await service.deleteBook('user-id', 'book-id');

    expect(rowsFor('book-id')).toEqual([]);
  });

  it("does not touch another user's book", async () => {
    await expect(
      service.deleteBook('another-user-id', 'book-id'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(tables.Book[0].deletedAt).toBeNull();
    expect(storage.deleteObjectsByPrefix).not.toHaveBeenCalled();
  });
});

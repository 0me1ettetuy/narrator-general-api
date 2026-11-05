import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { API_ERROR_CODES } from '../global-filters/api-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { temporalNow } from '../prisma/temporal.js';
import { toBookSummary } from '../books/book-summary.mapper.js';
import type {
  BookAuthor,
  Book,
  BookLibraryEntry,
} from '../books/types/book.type.js';
import type {
  CollectionBookEntry,
  CollectionDetailResponse,
  CollectionGhost,
  CollectionsListResponse,
  CollectionSummary,
  MyCollectionsListResponse,
} from './contracts/collections.response.js';
import type { AddCollectionBookDto } from './dto/add-collection-book.dto.js';
import type { CreateCollectionDto } from './dto/create-collection.dto.js';
import type {
  CollectionsListQueryDto,
  PublicCollectionsListQueryDto,
} from './dto/collections-list-query.dto.js';
import {
  MAX_BOOKS_PER_COLLECTION,
  type ReorderCollectionBooksDto,
} from './dto/reorder-collection-books.dto.js';
import type { UpdateCollectionDto } from './dto/update-collection.dto.js';
import type {
  Collection,
  CollectionBook,
  CollectionLibraryEntry,
} from './types/collection.type.js';

const DEFAULT_PAGE_SIZE = 20;

type CollectionBookView = {
  row: CollectionBook;
  book: Book;
  readable: boolean;
};

function toCollectionSummary(
  collection: Collection,
  viewerId: string,
  isAdded: boolean,
  views: CollectionBookView[],
  bookId?: string,
): CollectionSummary {
  const readable = views.filter((view) => view.readable);

  return {
    id: collection.id,
    title: collection.title,
    description: collection.description,
    visibility: collection.visibility,
    isOwner: collection.userId === viewerId,
    isAdded,
    bookCount: readable.length,
    coverBookId:
      readable.find((view) => view.book.coverObjectKey !== null)?.book.id ??
      null,
    // Unreadable books are only visible to the collection's owner, as ghosts.
    containsBook: views.some(
      (view) =>
        view.book.id === bookId &&
        (view.readable || collection.userId === viewerId),
    ),
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
  };
}

function compareCollectionsNewestFirst(
  first: Collection,
  second: Collection,
): number {
  return (
    second.createdAt.epochMilliseconds - first.createdAt.epochMilliseconds ||
    second.id.localeCompare(first.id)
  );
}

function compareBookViews(
  first: CollectionBookView,
  second: CollectionBookView,
): number {
  return (
    first.row.position - second.row.position ||
    first.row.id.localeCompare(second.row.id)
  );
}

@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async createCollection(
    userId: string,
    dto: CreateCollectionDto,
  ): Promise<CollectionSummary> {
    const now = temporalNow();
    const collection = (await this.prisma.db.orm.public.Collection.create({
      id: randomUUID(),
      userId,
      title: dto.title,
      description: dto.description ?? null,
      // Visibility is never accepted here: a new collection is always private.
      visibility: 'PRIVATE',
      createdAt: now,
      updatedAt: now,
    })) as Collection;

    return toCollectionSummary(collection, userId, false, []);
  }

  async listCollections(
    userId: string,
    query: CollectionsListQueryDto,
  ): Promise<MyCollectionsListResponse> {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const offset = query.offset ?? 0;
    const source = query.source ?? 'all';

    const owned =
      source === 'added'
        ? []
        : ((await this.prisma.db.orm.public.Collection.where({
            userId,
          }).all()) as Collection[]);
    const entries =
      source === 'owned'
        ? []
        : ((await this.prisma.db.orm.public.CollectionLibraryEntry.where({
            userId,
          }).all()) as CollectionLibraryEntry[]);
    const savedCollections = entries.length
      ? ((await this.prisma.db.orm.public.Collection.where((collection) =>
          collection.id.in(entries.map((entry) => entry.collectionId)),
        ).all()) as Collection[])
      : [];
    const savedById = new Map(
      savedCollections.map((collection) => [collection.id, collection]),
    );

    // Saved private collections stay listed as ghosts, using the title the
    // user saw when they saved it.
    const ghosts: CollectionGhost[] = [];
    const savedVisible: Collection[] = [];

    for (const entry of entries) {
      const collection = savedById.get(entry.collectionId);

      if (collection?.visibility === 'PUBLIC') {
        savedVisible.push(collection);
      } else if (collection) {
        ghosts.push({
          collectionId: entry.collectionId,
          title: entry.titleSnapshot,
        });
      }
    }

    const savedIds = new Set(entries.map((entry) => entry.collectionId));
    const combined = [...owned, ...savedVisible].sort(
      compareCollectionsNewestFirst,
    );
    const pageCollections = combined.slice(offset, offset + limit);
    const views = await this.loadBookViews(
      pageCollections.map((collection) => collection.id),
      userId,
    );

    return {
      collections: pageCollections.map((collection) =>
        toCollectionSummary(
          collection,
          userId,
          savedIds.has(collection.id),
          views.get(collection.id) ?? [],
          query.bookId,
        ),
      ),
      nextOffset: combined.length > offset + limit ? offset + limit : null,
      ghosts,
    };
  }

  async listPublicCollections(
    userId: string,
    query: PublicCollectionsListQueryDto,
  ): Promise<CollectionsListResponse> {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const offset = query.offset ?? 0;
    const search = query.search?.trim().toLowerCase() ?? '';

    // shortcut: filters in memory like listPublicBooks, move to SQL if the catalogue grows.
    const publicCollections = (
      (await this.prisma.db.orm.public.Collection.where({
        visibility: 'PUBLIC',
      }).all()) as Collection[]
    ).filter((collection) => collection.title.toLowerCase().includes(search));
    const views = await this.loadBookViews(
      publicCollections.map((collection) => collection.id),
      userId,
    );
    const visible = publicCollections
      .filter((collection) =>
        (views.get(collection.id) ?? []).some(
          (view) => view.book.visibility === 'PUBLIC',
        ),
      )
      .sort(compareCollectionsNewestFirst);
    const savedIds = await this.loadSavedCollectionIds(userId);

    return {
      collections: visible
        .slice(offset, offset + limit)
        .map((collection) =>
          toCollectionSummary(
            collection,
            userId,
            savedIds.has(collection.id),
            views.get(collection.id) ?? [],
          ),
        ),
      nextOffset: visible.length > offset + limit ? offset + limit : null,
    };
  }

  async getCollection(
    userId: string,
    collectionId: string,
  ): Promise<CollectionDetailResponse> {
    const collection = await this.getReadableCollection(userId, collectionId);
    const views =
      (await this.loadBookViews([collection.id], userId)).get(collection.id) ??
      [];
    const readableBookIds = views
      .filter((view) => view.readable)
      .map((view) => view.book.id);
    const authors = readableBookIds.length
      ? ((await this.prisma.db.orm.public.BookAuthor.where((author) =>
          author.bookId.in(readableBookIds),
        ).all()) as BookAuthor[])
      : [];
    const libraryEntries =
      (await this.prisma.db.orm.public.BookLibraryEntry.where({
        userId,
      }).all()) as BookLibraryEntry[];
    const addedBookIds = new Set(libraryEntries.map((entry) => entry.bookId));
    const isAdded =
      collection.userId !== userId &&
      (await this.prisma.db.orm.public.CollectionLibraryEntry.where({
        userId,
        collectionId: collection.id,
      }).first()) !== null;

    const books: CollectionBookEntry[] = [];

    for (const view of views) {
      if (view.readable) {
        books.push({
          bookId: view.book.id,
          title: view.book.title,
          position: view.row.position,
          isGhost: false,
          book: toBookSummary(
            view.book,
            userId,
            addedBookIds.has(view.book.id),
            authors.filter((author) => author.bookId === view.book.id),
          ),
        });
      } else if (collection.userId === userId) {
        books.push({
          bookId: view.book.id,
          title: view.book.title,
          position: view.row.position,
          isGhost: true,
          book: null,
        });
      }
    }

    return {
      collection: toCollectionSummary(collection, userId, isAdded, views),
      books,
    };
  }

  async updateCollection(
    userId: string,
    collectionId: string,
    dto: UpdateCollectionDto,
  ): Promise<CollectionSummary> {
    const collection = await this.getOwnedCollection(userId, collectionId);
    const patch: Partial<Collection> = { updatedAt: temporalNow() };

    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.description !== undefined) patch.description = dto.description;

    await this.prisma.db.orm.public.Collection.where({
      id: collection.id,
      userId,
    }).update(patch);

    return this.getCollectionSummary(userId, collection.id);
  }

  async deleteCollection(userId: string, collectionId: string): Promise<void> {
    const collection = await this.getOwnedCollection(userId, collectionId);

    await this.prisma.db.transaction(async (transaction) => {
      await transaction.orm.public.CollectionBook.where({
        collectionId: collection.id,
      }).deleteAndCount();
      await transaction.orm.public.CollectionLibraryEntry.where({
        collectionId: collection.id,
      }).deleteAndCount();
      await transaction.orm.public.Collection.where({
        id: collection.id,
      }).deleteAndCount();
    });
  }

  async addBook(
    userId: string,
    collectionId: string,
    dto: AddCollectionBookDto,
  ): Promise<void> {
    const collection = await this.getOwnedCollection(userId, collectionId);
    const book = (await this.prisma.db.orm.public.Book.where({
      id: dto.bookId,
      deletedAt: null,
    }).first()) as Book | null;

    if (!book || (book.userId !== userId && book.visibility !== 'PUBLIC')) {
      throw new NotFoundException({
        code: API_ERROR_CODES.notFound,
        message: 'Book not found',
      });
    }

    const existing = (await this.prisma.db.orm.public.CollectionBook.where({
      collectionId,
    }).all()) as CollectionBook[];

    if (existing.some((row) => row.bookId === book.id)) return;

    if (existing.length >= MAX_BOOKS_PER_COLLECTION) {
      throw new ConflictException({
        code: API_ERROR_CODES.conflict,
        message: 'Collection is full',
      });
    }

    const publishes =
      collection.visibility === 'PUBLIC' && book.visibility === 'PRIVATE';

    if (collection.visibility === 'PUBLIC' && book.parseStatus !== 'READY') {
      throw new ConflictException({
        code: API_ERROR_CODES.collectionBooksNotReady,
        message: 'Only fully parsed books can be added to a public collection',
      });
    }

    if (publishes && dto.makePublic !== true) {
      throw new ConflictException({
        code: API_ERROR_CODES.collectionBookNotPublic,
        message: 'Making this book public requires confirmation',
      });
    }

    const now = temporalNow();
    const position = existing.reduce(
      (highest, row) => Math.max(highest, row.position + 1),
      0,
    );

    await this.prisma.db.transaction(async (transaction) => {
      if (publishes) {
        await transaction.orm.public.Book.where({
          id: book.id,
          userId,
        }).update({ visibility: 'PUBLIC', updatedAt: now });
      }

      await transaction.orm.public.CollectionBook.create({
        id: randomUUID(),
        collectionId,
        bookId: book.id,
        position,
        createdAt: now,
      });
      await transaction.orm.public.Collection.where({
        id: collectionId,
      }).update({ updatedAt: now });
    });
  }

  async removeBook(
    userId: string,
    collectionId: string,
    bookId: string,
  ): Promise<void> {
    await this.getOwnedCollection(userId, collectionId);
    await this.prisma.db.orm.public.CollectionBook.where({
      collectionId,
      bookId,
    }).deleteAndCount();
    await this.prisma.db.orm.public.Collection.where({
      id: collectionId,
    }).update({ updatedAt: temporalNow() });
  }

  async reorderBooks(
    userId: string,
    collectionId: string,
    dto: ReorderCollectionBooksDto,
  ): Promise<void> {
    await this.getOwnedCollection(userId, collectionId);
    const rows = (await this.prisma.db.orm.public.CollectionBook.where({
      collectionId,
    }).all()) as CollectionBook[];
    const storedIds = new Set(rows.map((row) => row.bookId));

    if (
      dto.bookIds.length !== storedIds.size ||
      dto.bookIds.some((bookId) => !storedIds.has(bookId))
    ) {
      throw new BadRequestException({
        code: API_ERROR_CODES.validationFailed,
        message: 'The list must include every book in the collection once',
      });
    }

    const now = temporalNow();

    await this.prisma.db.transaction(async (transaction) => {
      for (const [position, bookId] of dto.bookIds.entries()) {
        await transaction.orm.public.CollectionBook.where({
          collectionId,
          bookId,
        }).update({ position });
      }
      await transaction.orm.public.Collection.where({
        id: collectionId,
      }).update({ updatedAt: now });
    });
  }

  private async getCollectionSummary(
    userId: string,
    collectionId: string,
  ): Promise<CollectionSummary> {
    const collection = await this.getReadableCollection(userId, collectionId);
    const views =
      (await this.loadBookViews([collectionId], userId)).get(collectionId) ??
      [];

    return toCollectionSummary(
      collection,
      userId,
      await this.isCollectionSaved(userId, collectionId),
      views,
    );
  }

  private async getOwnedCollection(
    userId: string,
    collectionId: string,
  ): Promise<Collection> {
    const collection = (await this.prisma.db.orm.public.Collection.where({
      id: collectionId,
      userId,
    }).first()) as Collection | null;

    if (!collection) {
      throw new NotFoundException({
        code: API_ERROR_CODES.notFound,
        message: 'Collection not found',
      });
    }

    return collection;
  }

  private async getReadableCollection(
    userId: string,
    collectionId: string,
  ): Promise<Collection> {
    const collection = (await this.prisma.db.orm.public.Collection.where({
      id: collectionId,
    }).first()) as Collection | null;

    if (
      !collection ||
      (collection.userId !== userId && collection.visibility !== 'PUBLIC')
    ) {
      throw new NotFoundException({
        code: API_ERROR_CODES.notFound,
        message: 'Collection not found',
      });
    }

    return collection;
  }

  private async isCollectionSaved(
    userId: string,
    collectionId: string,
  ): Promise<boolean> {
    return (
      (await this.prisma.db.orm.public.CollectionLibraryEntry.where({
        userId,
        collectionId,
      }).first()) !== null
    );
  }

  private async loadSavedCollectionIds(userId: string): Promise<Set<string>> {
    const entries =
      (await this.prisma.db.orm.public.CollectionLibraryEntry.where({
        userId,
      }).all()) as CollectionLibraryEntry[];

    return new Set(entries.map((entry) => entry.collectionId));
  }

  // Returns each collection's books in position order. Books that are deleted
  // are dropped; `readable` tells the viewer whether they may see the book.
  private async loadBookViews(
    collectionIds: string[],
    viewerId: string,
  ): Promise<Map<string, CollectionBookView[]>> {
    const views = new Map<string, CollectionBookView[]>();

    if (!collectionIds.length) return views;

    const rows = (await this.prisma.db.orm.public.CollectionBook.where((row) =>
      row.collectionId.in(collectionIds),
    ).all()) as CollectionBook[];
    const bookIds = [...new Set(rows.map((row) => row.bookId))];
    const books = bookIds.length
      ? ((await this.prisma.db.orm.public.Book.where((book) =>
          book.id.in(bookIds),
        ).all()) as Book[])
      : [];
    const bookById = new Map(
      books
        .filter((book) => book.deletedAt === null)
        .map((book) => [book.id, book]),
    );

    for (const row of rows) {
      const book = bookById.get(row.bookId);

      if (!book) continue;

      const list = views.get(row.collectionId) ?? [];
      list.push({
        row,
        book,
        readable: book.userId === viewerId || book.visibility === 'PUBLIC',
      });
      views.set(row.collectionId, list);
    }

    for (const list of views.values()) {
      list.sort(compareBookViews);
    }

    return views;
  }
}

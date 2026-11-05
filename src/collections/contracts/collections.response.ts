import type {
  BookSummary,
  BookVisibility,
} from '../../books/contracts/books.response.js';
import type { Instant } from '../../prisma/temporal.js';

export type CollectionSummary = {
  id: string;
  title: string;
  description: string | null;
  visibility: BookVisibility;
  isOwner: boolean;
  // Whether the viewer saved this (someone else's) collection.
  isAdded: boolean;
  // Books the viewer can read. Ghosts aren't counted.
  bookCount: number;
  // First readable book with a cover. Read it through the book cover endpoint.
  coverBookId: string | null;
  // False unless the list request passed bookId.
  containsBook: boolean;
  createdAt: Instant;
  updatedAt: Instant;
};

export type CollectionGhost = {
  collectionId: string;
  title: string;
};

export type CollectionBookEntry = {
  bookId: string;
  title: string;
  position: number;
  isGhost: boolean;
  // Null when isGhost is true.
  book: BookSummary | null;
};

export type CollectionDetailResponse = {
  collection: CollectionSummary;
  books: CollectionBookEntry[];
};

export type CollectionsListResponse = {
  collections: CollectionSummary[];
  nextOffset: number | null;
};

export type MyCollectionsListResponse = CollectionsListResponse & {
  ghosts: CollectionGhost[];
};

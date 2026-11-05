import type { BookVisibility } from '../../books/contracts/books.response.js';
import type { Instant } from '../../prisma/temporal.js';

export type Collection = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  visibility: BookVisibility;
  createdAt: Instant;
  updatedAt: Instant;
};

export type CollectionBook = {
  id: string;
  collectionId: string;
  bookId: string;
  position: number;
  createdAt: Instant;
};

export type CollectionLibraryEntry = {
  id: string;
  userId: string;
  collectionId: string;
  titleSnapshot: string;
  createdAt: Instant;
};

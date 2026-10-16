import type { Instant } from '../../prisma/temporal.js';
import type { BookParseStatus } from '../contracts/books.response.js';

export type Book = {
  id: string;
  userId: string;
  title: string;
  sourceFormat: 'EPUB';
  sourceObjectKey: string;
  sourceOriginalFilename: string;
  sourceMimeType: string;
  sourceSize: number;
  sourceChecksum: string | null;
  parseStatus: BookParseStatus;
  parseError: string | null;
  parsedAt: Instant | null;
  chapterCount: number;
  createdAt: Instant;
  updatedAt: Instant;
};

export type BookAuthor = {
  id: string;
  bookId: string;
  name: string;
  position: number;
};

export type Chapter = {
  id: string;
  bookId: string;
  position: number;
  title: string;
  sourceHref: string | null;
  text: string;
  wordCount: number;
};

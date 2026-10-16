import type { Instant } from '../../prisma/temporal.js';

export type BookParseStatus =
  'UPLOADING' | 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';

export type BookSummary = {
  id: string;
  title: string;
  sourceFormat: 'EPUB';
  sourceOriginalFilename: string;
  sourceMimeType: string;
  sourceSize: number;
  parseStatus: BookParseStatus;
  chapterCount: number;
  createdAt: Instant;
  updatedAt: Instant;
};

export type BookAuthorResponse = {
  id: string;
  name: string;
  position: number;
};

export type ChapterSummaryResponse = {
  id: string;
  position: number;
  title: string;
  wordCount: number;
};

export type BooksListResponse = {
  books: BookSummary[];
  nextOffset: number | null;
};

export type BookDetailResponse = {
  book: BookSummary;
  authors: BookAuthorResponse[];
  chapters: ChapterSummaryResponse[];
};

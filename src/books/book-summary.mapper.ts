import type {
  BookAuthorResponse,
  BookSummary,
} from './contracts/books.response.js';
import type { Book, BookAuthor, Chapter } from './types/book.type.js';

export function toBookSummary(
  book: Book,
  requesterId: string,
  isAdded: boolean,
  authors: BookAuthor[] = [],
): BookSummary {
  return {
    id: book.id,
    title: book.title,
    language: book.language,
    sourceFormat: book.sourceFormat,
    sourceOriginalFilename: book.sourceOriginalFilename,
    sourceMimeType: book.sourceMimeType,
    sourceSize: book.sourceSize,
    authors: authors.sort(compareByPosition).map(toBookAuthorResponse),
    hasCover: book.coverObjectKey !== null,
    parseStatus: book.parseStatus,
    chapterCount: book.chapterCount,
    visibility: book.visibility,
    isOwner: book.userId === requesterId,
    isAdded,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
  };
}

export function toBookAuthorResponse(author: BookAuthor): BookAuthorResponse {
  return {
    id: author.id,
    name: author.name,
    position: author.position,
  };
}

export function compareByPosition(
  first: BookAuthor | Chapter,
  second: BookAuthor | Chapter,
): number {
  return first.position - second.position || first.id.localeCompare(second.id);
}

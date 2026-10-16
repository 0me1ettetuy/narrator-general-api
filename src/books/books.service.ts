import { Injectable, NotFoundException } from '@nestjs/common';
import { API_ERROR_CODES } from '../global-filters/api-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  BookAuthorResponse,
  BookDetailResponse,
  BookSummary,
  BooksListResponse,
  ChapterSummaryResponse,
} from './contracts/books.response.js';
import type { BooksListQueryDto } from './dto/books-list-query.dto.js';
import type { Book, BookAuthor, Chapter } from './types/book.type.js';

const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class BooksService {
  constructor(private readonly prisma: PrismaService) {}

  async listBooks(
    userId: string,
    query: BooksListQueryDto,
  ): Promise<BooksListResponse> {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const offset = query.offset ?? 0;
    const books = (await this.prisma.db.orm.public.Book.where({ userId })
      .orderBy([(book) => book.createdAt.desc(), (book) => book.id.desc()])
      .offset(offset)
      .limit(limit + 1)
      .all()) as Book[];
    const hasNextPage = books.length > limit;

    return {
      books: books.slice(0, limit).map(toBookSummary),
      nextOffset: hasNextPage ? offset + limit : null,
    };
  }

  async getBook(userId: string, bookId: string): Promise<BookDetailResponse> {
    const book = await this.prisma.db.orm.public.Book.where({
      id: bookId,
      userId,
    }).first();

    if (!book) {
      throw new NotFoundException({
        code: API_ERROR_CODES.notFound,
        message: 'Book not found',
      });
    }

    const [authors, chapters] = (await Promise.all([
      this.prisma.db.orm.public.BookAuthor.where({ bookId }).all(),
      this.prisma.db.orm.public.Chapter.where({ bookId }).all(),
    ])) as [BookAuthor[], Chapter[]];

    return {
      book: toBookSummary(book),
      authors: authors.sort(compareByPosition).map(toBookAuthorResponse),
      chapters: chapters.sort(compareByPosition).map(toChapterSummaryResponse),
    };
  }
}

function toBookSummary(book: Book): BookSummary {
  return {
    id: book.id,
    title: book.title,
    sourceFormat: book.sourceFormat,
    sourceOriginalFilename: book.sourceOriginalFilename,
    sourceMimeType: book.sourceMimeType,
    sourceSize: book.sourceSize,
    parseStatus: book.parseStatus,
    chapterCount: book.chapterCount,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
  };
}

function toBookAuthorResponse(author: BookAuthor): BookAuthorResponse {
  return {
    id: author.id,
    name: author.name,
    position: author.position,
  };
}

function toChapterSummaryResponse(chapter: Chapter): ChapterSummaryResponse {
  return {
    id: chapter.id,
    position: chapter.position,
    title: chapter.title,
    wordCount: chapter.wordCount,
  };
}

function compareByPosition(
  first: BookAuthor | Chapter,
  second: BookAuthor | Chapter,
): number {
  return first.position - second.position || first.id.localeCompare(second.id);
}

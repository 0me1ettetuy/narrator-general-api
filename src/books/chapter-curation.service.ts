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
import { BooksService } from './books.service.js';
import type {
  ChapterDetailResponse,
  ChapterMergeResponse,
  RemovedChaptersResponse,
  ChapterSelectionResponse,
  ChapterSummaryResponse,
} from './contracts/books.response.js';
import type {
  CreateChapterDto,
  MergeChaptersDto,
  RemoveChapterDto,
  UpdateChapterDto,
  UpdateChapterOrderDto,
  UpdateChapterSelectionDto,
} from './dto/chapter-curation.dto.js';
import type { Audio, Book, Chapter } from './types/book.type.js';

const ACTIVE_AUDIO_STATUSES = new Set(['QUEUED', 'PROCESSING', 'DELETING']);

@Injectable()
export class ChapterCurationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly booksService: BooksService,
  ) {}

  async getChapter(
    userId: string,
    bookId: string,
    chapterId: string,
  ): Promise<ChapterDetailResponse> {
    await this.getOwnedBook(userId, bookId);
    const chapter = await this.getActiveChapter(bookId, chapterId);
    const audio = (await this.prisma.db.orm.public.Audio.where({
      chapterId: chapter.id,
    }).first()) as Audio | null;

    return toChapterDetailResponse(chapter, audio);
  }

  async listRemovedChapters(
    userId: string,
    bookId: string,
  ): Promise<RemovedChaptersResponse> {
    const book = await this.getOwnedBook(userId, bookId);
    const chapters = (await this.prisma.db.orm.public.Chapter.where({
      bookId: book.id,
    }).all()) as Chapter[];
    const removedChapters = chapters
      .filter(
        (chapter) =>
          Boolean(chapter.removedAt) && chapter.mergedIntoChapterId === null,
      )
      .sort(compareByPosition);
    const responses = await Promise.all(
      removedChapters.map(async (chapter) => {
        const audio = (await this.prisma.db.orm.public.Audio.where({
          chapterId: chapter.id,
        }).first()) as Audio | null;

        return toChapterSummaryResponse(chapter, audio);
      }),
    );

    return { chapters: responses };
  }

  async updateChapter(
    userId: string,
    bookId: string,
    chapterId: string,
    dto: UpdateChapterDto,
  ): Promise<ChapterDetailResponse> {
    const book = await this.getOwnedBook(userId, bookId);
    const chapter = await this.getActiveChapter(book.id, chapterId);
    const changesContent = dto.text !== undefined && dto.text !== chapter.text;
    const changesClassification =
      dto.role !== undefined || dto.includeInDefaultNarration !== undefined;

    if (
      dto.title === undefined &&
      dto.text === undefined &&
      dto.role === undefined &&
      dto.includeInDefaultNarration === undefined
    ) {
      throw new BadRequestException({
        code: API_ERROR_CODES.validationFailed,
        message: 'Provide at least one chapter change',
      });
    }

    if (changesContent) {
      await this.discardAudioIfNeeded(book, [chapter], dto.discardAudio);
    }

    const now = temporalNow();
    await this.prisma.db.orm.public.Chapter.where({
      id: chapter.id,
      bookId: book.id,
      removedAt: null,
    }).update({
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.text !== undefined
        ? { text: dto.text, wordCount: countWords(dto.text), editedAt: now }
        : {}),
      ...(dto.role !== undefined ? { role: dto.role } : {}),
      ...(dto.includeInDefaultNarration !== undefined
        ? { includeInDefaultNarration: dto.includeInDefaultNarration }
        : {}),
      ...(changesClassification
        ? {
            classificationSource: 'USER',
            classificationConfidence: null,
            classificationReason: 'USER_OVERRIDE',
          }
        : {}),
      updatedAt: now,
    });

    return this.getChapter(userId, book.id, chapter.id);
  }

  async createChapter(
    userId: string,
    bookId: string,
    dto: CreateChapterDto,
  ): Promise<ChapterDetailResponse> {
    const book = await this.getOwnedBook(userId, bookId);
    const activeChapters = await this.getActiveChapters(book.id);
    const insertIndex = dto.afterChapterId
      ? activeChapters.findIndex(
          (chapter) => chapter.id === dto.afterChapterId,
        ) + 1
      : activeChapters.length;

    if (dto.afterChapterId && insertIndex === 0) {
      throw new NotFoundException({
        code: API_ERROR_CODES.notFound,
        message: 'Chapter not found',
      });
    }

    const chapterId = randomUUID();
    const now = temporalNow();
    await this.prisma.db.transaction(async (transaction) => {
      const insertedChapter = await transaction.orm.public.Chapter.create({
        id: chapterId,
        bookId: book.id,
        position: activeChapters.length,
        title: dto.title,
        text: dto.text,
        wordCount: countWords(dto.text),
        role: dto.role ?? 'MAIN',
        includeInDefaultNarration: dto.includeInDefaultNarration ?? true,
        classificationSource: 'USER',
        classificationConfidence: null,
        classificationReason: 'USER_CREATED',
        origin: 'USER',
        editedAt: now,
        updatedAt: now,
      });
      const chapters = [...activeChapters];

      chapters.splice(insertIndex, 0, insertedChapter as Chapter);
      await reindexChapters(transaction, chapters, now);
      await transaction.orm.public.Book.where({ id: book.id }).update({
        chapterCount: chapters.length,
        updatedAt: now,
      });
    });

    return this.getChapter(userId, book.id, chapterId);
  }

  async updateSelection(
    userId: string,
    bookId: string,
    dto: UpdateChapterSelectionDto,
  ): Promise<ChapterSelectionResponse> {
    const book = await this.getOwnedBook(userId, bookId);

    if (dto.role === undefined && dto.includeInDefaultNarration === undefined) {
      throw new BadRequestException({
        code: API_ERROR_CODES.validationFailed,
        message: 'Provide a role or narration inclusion change',
      });
    }

    const chapters = await this.getSelectedActiveChapters(
      book.id,
      dto.chapterIds,
    );
    const now = temporalNow();

    await this.prisma.db.transaction(async (transaction) => {
      for (const chapter of chapters) {
        await transaction.orm.public.Chapter.where({
          id: chapter.id,
          bookId: book.id,
          removedAt: null,
        }).update({
          ...(dto.role !== undefined ? { role: dto.role } : {}),
          ...(dto.includeInDefaultNarration !== undefined
            ? { includeInDefaultNarration: dto.includeInDefaultNarration }
            : {}),
          classificationSource: 'USER',
          classificationConfidence: null,
          classificationReason: 'USER_OVERRIDE',
          updatedAt: now,
        });
      }
    });

    return { updatedChapterIds: chapters.map((chapter) => chapter.id) };
  }

  async mergeChapters(
    userId: string,
    bookId: string,
    dto: MergeChaptersDto,
  ): Promise<ChapterMergeResponse> {
    const book = await this.getOwnedBook(userId, bookId);
    const activeChapters = await this.getActiveChapters(book.id);
    const selectedChapters = getContiguousChapters(
      activeChapters,
      dto.chapterIds,
    );

    if (selectedChapters.length !== dto.chapterIds.length) {
      throw new NotFoundException({
        code: API_ERROR_CODES.notFound,
        message: 'Chapter not found',
      });
    }

    await this.discardAudioIfNeeded(book, selectedChapters, dto.discardAudio);

    const primaryChapter = selectedChapters[0];
    const mergedChapters = selectedChapters.slice(1);
    const firstRemovedPosition = await this.getNextRemovedPosition(book.id);
    const now = temporalNow();
    const mergedText = selectedChapters
      .map((chapter) => chapter.text)
      .join('\n\n');
    const removedChapterIds = mergedChapters.map((chapter) => chapter.id);

    await this.prisma.db.transaction(async (transaction) => {
      await transaction.orm.public.Chapter.where({
        id: primaryChapter.id,
        bookId: book.id,
        removedAt: null,
      }).update({
        title: dto.title,
        text: mergedText,
        wordCount: countWords(mergedText),
        role: dto.role,
        includeInDefaultNarration: dto.includeInDefaultNarration,
        classificationSource: 'USER',
        classificationConfidence: null,
        classificationReason: 'USER_MERGED',
        editedAt: now,
        updatedAt: now,
      });

      for (const [index, chapter] of mergedChapters.entries()) {
        await transaction.orm.public.Chapter.where({
          id: chapter.id,
          bookId: book.id,
          removedAt: null,
        }).update({
          removedAt: now,
          mergedIntoChapterId: primaryChapter.id,
          includeInDefaultNarration: false,
          position: firstRemovedPosition - index,
          updatedAt: now,
        });
      }

      const remainingChapters = activeChapters.filter(
        (chapter) => !removedChapterIds.includes(chapter.id),
      );
      await reindexChapters(transaction, remainingChapters, now);
      await transaction.orm.public.Book.where({ id: book.id }).update({
        chapterCount: remainingChapters.length,
        updatedAt: now,
      });
    });

    return {
      chapter: await this.getChapterSummary(book.id, primaryChapter.id),
      removedChapterIds,
    };
  }

  async removeChapter(
    userId: string,
    bookId: string,
    chapterId: string,
    dto: RemoveChapterDto,
  ): Promise<void> {
    const book = await this.getOwnedBook(userId, bookId);
    const chapter = await this.getActiveChapter(book.id, chapterId);
    await this.discardAudioIfNeeded(book, [chapter], dto.discardAudio);

    const activeChapters = await this.getActiveChapters(book.id);
    const removedPosition = await this.getNextRemovedPosition(book.id);
    const now = temporalNow();
    await this.prisma.db.transaction(async (transaction) => {
      await transaction.orm.public.Chapter.where({
        id: chapter.id,
        bookId: book.id,
        removedAt: null,
      }).update({
        removedAt: now,
        includeInDefaultNarration: false,
        position: removedPosition,
        updatedAt: now,
      });
      const remainingChapters = activeChapters.filter(
        (activeChapter) => activeChapter.id !== chapter.id,
      );

      await reindexChapters(transaction, remainingChapters, now);
      await transaction.orm.public.Book.where({ id: book.id }).update({
        chapterCount: remainingChapters.length,
        updatedAt: now,
      });
    });
  }

  async restoreChapter(
    userId: string,
    bookId: string,
    chapterId: string,
  ): Promise<ChapterDetailResponse> {
    const book = await this.getOwnedBook(userId, bookId);
    const chapter = (await this.prisma.db.orm.public.Chapter.where({
      id: chapterId,
      bookId: book.id,
    }).first()) as Chapter | null;

    if (!chapter || !chapter.removedAt) {
      throw new NotFoundException({
        code: API_ERROR_CODES.notFound,
        message: 'Removed chapter not found',
      });
    }

    if (chapter.mergedIntoChapterId) {
      throw new ConflictException({
        code: API_ERROR_CODES.conflict,
        message: 'Merged chapters cannot be restored individually',
      });
    }

    const activeChapters = await this.getActiveChapters(book.id);
    const now = temporalNow();
    await this.prisma.db.transaction(async (transaction) => {
      await transaction.orm.public.Chapter.where({
        id: chapter.id,
        bookId: book.id,
      }).update({
        removedAt: null,
        includeInDefaultNarration: true,
        updatedAt: now,
      });
      const restoredChapters = [...activeChapters, chapter].sort(
        compareByPosition,
      );

      await reindexChapters(transaction, restoredChapters, now);
      await transaction.orm.public.Book.where({ id: book.id }).update({
        chapterCount: restoredChapters.length,
        updatedAt: now,
      });
    });

    return this.getChapter(userId, book.id, chapter.id);
  }

  async reorderChapters(
    userId: string,
    bookId: string,
    dto: UpdateChapterOrderDto,
  ): Promise<void> {
    const book = await this.getOwnedBook(userId, bookId);
    const activeChapters = await this.getActiveChapters(book.id);
    const requestedIds = new Set(dto.chapterIds);

    if (
      requestedIds.size !== activeChapters.length ||
      activeChapters.some((chapter) => !requestedIds.has(chapter.id))
    ) {
      throw new BadRequestException({
        code: API_ERROR_CODES.validationFailed,
        message: 'chapterIds must contain every active chapter exactly once',
      });
    }

    const chapterById = new Map(
      activeChapters.map((chapter) => [chapter.id, chapter]),
    );
    const orderedChapters = dto.chapterIds.map(
      (chapterId) => chapterById.get(chapterId) as Chapter,
    );
    const now = temporalNow();

    await this.prisma.db.transaction(async (transaction) => {
      await reindexChapters(transaction, orderedChapters, now);
      await transaction.orm.public.Book.where({ id: book.id }).update({
        updatedAt: now,
      });
    });
  }

  private async getOwnedBook(userId: string, bookId: string): Promise<Book> {
    const book = (await this.prisma.db.orm.public.Book.where({
      id: bookId,
      userId,
    }).first()) as Book | null;

    if (!book) {
      throw new NotFoundException({
        code: API_ERROR_CODES.notFound,
        message: 'Book not found',
      });
    }

    return book;
  }

  private async getActiveChapter(
    bookId: string,
    chapterId: string,
  ): Promise<Chapter> {
    const chapter = (await this.prisma.db.orm.public.Chapter.where({
      id: chapterId,
      bookId,
      removedAt: null,
    }).first()) as Chapter | null;

    if (!chapter) {
      throw new NotFoundException({
        code: API_ERROR_CODES.notFound,
        message: 'Chapter not found',
      });
    }

    return chapter;
  }

  private async getActiveChapters(bookId: string): Promise<Chapter[]> {
    const chapters = (await this.prisma.db.orm.public.Chapter.where({
      bookId,
      removedAt: null,
    }).all()) as Chapter[];

    return chapters.sort(compareByPosition);
  }

  private async getNextRemovedPosition(bookId: string): Promise<number> {
    const chapters = (await this.prisma.db.orm.public.Chapter.where({
      bookId,
    }).all()) as Chapter[];
    const smallestPosition = Math.min(
      -1,
      ...chapters.map((chapter) => chapter.position),
    );

    return smallestPosition - 1;
  }

  private async getSelectedActiveChapters(
    bookId: string,
    chapterIds: string[],
  ): Promise<Chapter[]> {
    const requestedIds = new Set(chapterIds);
    const chapters = (await this.getActiveChapters(bookId)).filter((chapter) =>
      requestedIds.has(chapter.id),
    );

    if (chapters.length !== requestedIds.size) {
      throw new NotFoundException({
        code: API_ERROR_CODES.notFound,
        message: 'Chapter not found',
      });
    }

    return chapters;
  }

  private async getChapterSummary(
    bookId: string,
    chapterId: string,
  ): Promise<ChapterSummaryResponse> {
    const chapter = await this.getActiveChapter(bookId, chapterId);
    const audio = (await this.prisma.db.orm.public.Audio.where({
      chapterId: chapter.id,
    }).first()) as Audio | null;

    return toChapterSummaryResponse(chapter, audio);
  }

  private async discardAudioIfNeeded(
    book: Book,
    chapters: Chapter[],
    discardAudio: boolean | undefined,
  ): Promise<void> {
    const audioByChapter = await Promise.all(
      chapters.map(async (chapter) => {
        const audio = (await this.prisma.db.orm.public.Audio.where({
          chapterId: chapter.id,
        }).first()) as Audio | null;

        return { chapter, audio };
      }),
    );

    if (
      audioByChapter.some(
        ({ audio }) => audio && ACTIVE_AUDIO_STATUSES.has(audio.status),
      )
    ) {
      throw new ConflictException({
        code: API_ERROR_CODES.conflict,
        message: 'Stop audio generation before changing this chapter',
      });
    }

    if (audioByChapter.some(({ audio }) => audio) && !discardAudio) {
      throw new ConflictException({
        code: API_ERROR_CODES.conflict,
        message: 'Confirm that existing chapter audio should be deleted',
      });
    }

    for (const { chapter, audio } of audioByChapter) {
      if (audio) {
        await this.booksService.deleteChapterAudio(
          book.userId,
          book.id,
          chapter.id,
        );
      }
    }
  }
}

function toChapterSummaryResponse(
  chapter: Chapter,
  audio: Audio | null,
): ChapterSummaryResponse {
  return {
    id: chapter.id,
    position: chapter.position,
    title: chapter.title,
    wordCount: chapter.wordCount,
    role: chapter.role,
    includeInDefaultNarration: chapter.includeInDefaultNarration,
    classificationSource: chapter.classificationSource,
    classificationConfidence: chapter.classificationConfidence,
    classificationReason: chapter.classificationReason,
    audio: audio
      ? {
          id: audio.id,
          modelId: audio.modelKey,
          status: audio.status,
          processingStage: audio.processingStage,
          totalChunks: audio.totalChunks,
          completedChunks: audio.completedChunks,
          error: audio.error,
        }
      : null,
  };
}

function toChapterDetailResponse(
  chapter: Chapter,
  audio: Audio | null,
): ChapterDetailResponse {
  return {
    ...toChapterSummaryResponse(chapter, audio),
    text: chapter.text,
    origin: chapter.origin,
  };
}

function getContiguousChapters(
  activeChapters: Chapter[],
  chapterIds: string[],
): Chapter[] {
  const selectedChapterIds = new Set(chapterIds);
  const selectedChapters = activeChapters.filter((chapter) =>
    selectedChapterIds.has(chapter.id),
  );

  if (selectedChapters.length !== selectedChapterIds.size) {
    return [];
  }

  const firstIndex = activeChapters.findIndex(
    (chapter) => chapter.id === selectedChapters[0]?.id,
  );
  const isContiguous = selectedChapters.every(
    (chapter, index) => activeChapters[firstIndex + index]?.id === chapter.id,
  );

  if (!isContiguous) {
    throw new BadRequestException({
      code: API_ERROR_CODES.validationFailed,
      message: 'Only adjacent chapters can be merged',
    });
  }

  return selectedChapters;
}

async function reindexChapters(
  transaction: Pick<PrismaService['db'], 'orm'>,
  chapters: Chapter[],
  updatedAt: ReturnType<typeof temporalNow>,
): Promise<void> {
  for (const [index, chapter] of chapters.entries()) {
    await transaction.orm.public.Chapter.where({ id: chapter.id }).update({
      position: 1_000_000_000 + index,
      updatedAt,
    });
  }

  for (const [position, chapter] of chapters.entries()) {
    await transaction.orm.public.Chapter.where({ id: chapter.id }).update({
      position,
      updatedAt,
    });
  }
}

function compareByPosition(first: Chapter, second: Chapter): number {
  return first.position - second.position || first.id.localeCompare(second.id);
}

function countWords(text: string): number {
  return text.split(/\s+/u).length;
}

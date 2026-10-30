import type { Instant } from '../../prisma/temporal.js';
import type {
  AudioProcessingStage,
  AudioStatus,
  BookParseStatus,
  ChapterClassificationConfidence,
  ChapterClassificationSource,
  ChapterOrigin,
  ChapterRole,
  JobStatus,
} from '../contracts/books.response.js';

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
  coverObjectKey: string | null;
  coverMimeType: string | null;
  coverSize: number | null;
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
  role: ChapterRole;
  includeInDefaultNarration: boolean;
  classificationSource: ChapterClassificationSource;
  classificationConfidence: ChapterClassificationConfidence | null;
  classificationReason: string | null;
  origin: ChapterOrigin;
  removedAt: Instant | null;
  mergedIntoChapterId: string | null;
  editedAt: Instant | null;
};

export type Audio = {
  id: string;
  chapterId: string;
  modelKey: string | null;
  voice: string | null;
  status: AudioStatus;
  processingStage: AudioProcessingStage | null;
  totalChunks: number;
  completedChunks: number;
  error: string | null;
};

export type ProcessingJob = {
  id: string;
  status: JobStatus;
  progress: number;
};

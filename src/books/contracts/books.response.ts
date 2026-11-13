import type { Instant } from '../../prisma/temporal.js';

export type BookParseStatus =
  'UPLOADING' | 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';

export type AudioStatus =
  'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED' | 'CANCELLED' | 'DELETING';

export type AudioProcessingStage =
  'CHUNKING' | 'GENERATING' | 'MERGING' | 'UPLOADING';

export type ChapterRole =
  | 'MAIN'
  | 'FRONT_MATTER'
  | 'NAVIGATION'
  | 'REFERENCE'
  | 'BACK_MATTER'
  | 'OTHER';

export type ChapterClassificationSource = 'EPUB' | 'HEURISTIC' | 'USER';

export type ChapterClassificationConfidence = 'HIGH' | 'LOW';

export type ChapterOrigin = 'IMPORTED' | 'USER';

export type JobStatus =
  'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type BookVisibility = 'PRIVATE' | 'PUBLIC';

export type BookSummary = {
  id: string;
  title: string;
  language: string | null;
  sourceFormat: 'EPUB';
  sourceOriginalFilename: string;
  sourceMimeType: string;
  sourceSize: number;
  authors: BookAuthorResponse[];
  hasCover: boolean;
  parseStatus: BookParseStatus;
  chapterCount: number;
  visibility: BookVisibility;
  // Whether the requesting user owns this book (full edit rights) or is
  // only reading it because it's public.
  isOwner: boolean;
  // Whether the requesting user has added this (someone else's) public book
  // to their own library list. Always false for a book they own.
  isAdded: boolean;
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
  role: ChapterRole;
  includeInDefaultNarration: boolean;
  classificationSource: ChapterClassificationSource;
  classificationConfidence: ChapterClassificationConfidence | null;
  classificationReason: string | null;
  audio: ChapterAudioResponse | null;
};

export type ChapterImageResponse = {
  id: string;
  url: string;
  alt: string | null;
};

export type ChapterDetailResponse = ChapterSummaryResponse & {
  text: string;
  images: ChapterImageResponse[];
  origin: ChapterOrigin;
};

export type ChapterMergeResponse = {
  chapter: ChapterSummaryResponse;
  removedChapterIds: string[];
};

export type ChapterSelectionResponse = {
  updatedChapterIds: string[];
};

export type RemovedChaptersResponse = {
  chapters: ChapterSummaryResponse[];
};

export type ChapterAudioResponse = {
  id: string;
  modelId: string | null;
  voice: string | null;
  voiceName: string | null;
  status: AudioStatus;
  processingStage: AudioProcessingStage | null;
  totalChunks: number;
  completedChunks: number;
  error: string | null;
};

export type ActiveAudioChapterResponse = {
  id: string;
  position: number;
  title: string;
  audio: ChapterAudioResponse;
};

export type ActiveAudioBookResponse = {
  bookId: string;
  title: string;
  hasCover: boolean;
  chapters: ActiveAudioChapterResponse[];
};

export type ActiveAudioResponse = {
  books: ActiveAudioBookResponse[];
};

export type ChapterAudioJobResponse = {
  id: string;
  status: JobStatus;
  progress: number;
};

export type QueueChapterAudioResponse = {
  audio: ChapterAudioResponse;
  job: ChapterAudioJobResponse | null;
};

export type BatchChapterAudioResponse = {
  affectedChapterIds: string[];
  skippedChapterIds: string[];
};

export type ChapterAudioAccessResponse = {
  playbackUrl: string;
  downloadUrl: string;
  expiresInSeconds: number;
};

export type BookCoverAccessResponse = {
  coverUrl: string;
  expiresInSeconds: number;
};

export type CreateBookCoverUploadResponse = {
  uploadUrl: string;
};

export type BooksListResponse = {
  books: BookSummary[];
  nextOffset: number | null;
};

export type GhostBook = {
  bookId: string;
  title: string;
};

export type LibraryBooksListResponse = BooksListResponse & {
  ghosts: GhostBook[];
};

export type CreateBookUploadResponse = {
  bookId: string;
  uploadUrl: string;
};

export type CompleteBookUploadResponse = {
  bookId: string;
  jobId: string;
  parseStatus: 'QUEUED';
};

export type BookDetailResponse = {
  book: BookSummary;
  authors: BookAuthorResponse[];
  chapters: ChapterSummaryResponse[];
};

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

export type BookSummary = {
  id: string;
  title: string;
  language: string | null;
  sourceFormat: 'EPUB';
  sourceOriginalFilename: string;
  sourceMimeType: string;
  sourceSize: number;
  hasCover: boolean;
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
  role: ChapterRole;
  includeInDefaultNarration: boolean;
  classificationSource: ChapterClassificationSource;
  classificationConfidence: ChapterClassificationConfidence | null;
  classificationReason: string | null;
  audio: ChapterAudioResponse | null;
};

export type ChapterDetailResponse = ChapterSummaryResponse & {
  text: string;
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
  status: AudioStatus;
  processingStage: AudioProcessingStage | null;
  totalChunks: number;
  completedChunks: number;
  error: string | null;
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

export type BooksListResponse = {
  books: BookSummary[];
  nextOffset: number | null;
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

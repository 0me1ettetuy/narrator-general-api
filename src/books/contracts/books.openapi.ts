import { ApiProperty } from '@nestjs/swagger';

export class BookSummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Primary BCP 47 language declared by the EPUB metadata',
  })
  language: string | null;

  @ApiProperty({ enum: ['EPUB'] })
  sourceFormat: 'EPUB';

  @ApiProperty()
  sourceOriginalFilename: string;

  @ApiProperty()
  sourceMimeType: string;

  @ApiProperty({ minimum: 0 })
  sourceSize: number;

  @ApiProperty({
    description: 'Whether the uploaded EPUB contains a cover image',
  })
  hasCover: boolean;

  @ApiProperty({
    enum: ['UPLOADING', 'QUEUED', 'PROCESSING', 'READY', 'FAILED'],
  })
  parseStatus: string;

  @ApiProperty({ minimum: 0 })
  chapterCount: number;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class BookAuthorResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ minimum: 0 })
  position: number;
}

export class ChapterSummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ minimum: 0 })
  position: number;

  @ApiProperty()
  title: string;

  @ApiProperty({ minimum: 0 })
  wordCount: number;

  @ApiProperty({
    enum: [
      'MAIN',
      'FRONT_MATTER',
      'NAVIGATION',
      'REFERENCE',
      'BACK_MATTER',
      'OTHER',
    ],
  })
  role: string;

  @ApiProperty({
    description: 'Whether this chapter is selected by default for narration',
  })
  includeInDefaultNarration: boolean;

  @ApiProperty({ enum: ['EPUB', 'HEURISTIC', 'USER'] })
  classificationSource: string;

  @ApiProperty({ type: String, nullable: true, enum: ['HIGH', 'LOW'] })
  classificationConfidence: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Safe code explaining the import suggestion',
  })
  classificationReason: string | null;

  @ApiProperty({ type: () => ChapterAudioResponseDto, nullable: true })
  audio: ChapterAudioResponseDto | null;
}

export class ChapterDetailResponseDto extends ChapterSummaryResponseDto {
  @ApiProperty({ description: 'Plain editable chapter text' })
  text: string;

  @ApiProperty({ enum: ['IMPORTED', 'USER'] })
  origin: string;
}

export class ChapterMergeResponseDto {
  @ApiProperty({ type: () => ChapterSummaryResponseDto })
  chapter: ChapterSummaryResponseDto;

  @ApiProperty({ type: [String], format: 'uuid' })
  removedChapterIds: string[];
}

export class ChapterSelectionResponseDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  updatedChapterIds: string[];
}

export class RemovedChaptersResponseDto {
  @ApiProperty({ type: () => [ChapterSummaryResponseDto] })
  chapters: ChapterSummaryResponseDto[];
}

export class ChapterAudioResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    nullable: true,
    example: 'local.kokoro-82m',
    description: 'The Narrator model selected when this audio was queued',
  })
  modelId: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The provider voice ID snapshotted when this audio was queued',
  })
  voice: string | null;

  @ApiProperty({
    enum: ['QUEUED', 'PROCESSING', 'READY', 'FAILED', 'CANCELLED', 'DELETING'],
  })
  status: string;

  @ApiProperty({
    nullable: true,
    enum: ['CHUNKING', 'GENERATING', 'MERGING', 'UPLOADING'],
  })
  processingStage: string | null;

  @ApiProperty({ minimum: 0 })
  totalChunks: number;

  @ApiProperty({ minimum: 0 })
  completedChunks: number;

  @ApiProperty({ nullable: true })
  error: string | null;
}

export class ChapterAudioJobResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    enum: ['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'],
  })
  status: string;

  @ApiProperty({ minimum: 0, maximum: 100 })
  progress: number;
}

export class QueueChapterAudioResponseDto {
  @ApiProperty({ type: () => ChapterAudioResponseDto })
  audio: ChapterAudioResponseDto;

  @ApiProperty({ type: () => ChapterAudioJobResponseDto, nullable: true })
  job: ChapterAudioJobResponseDto | null;
}

export class BatchChapterAudioResponseDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  affectedChapterIds: string[];

  @ApiProperty({ type: [String], format: 'uuid' })
  skippedChapterIds: string[];
}

export class ChapterAudioAccessResponseDto {
  @ApiProperty({ format: 'uri' })
  playbackUrl: string;

  @ApiProperty({ format: 'uri' })
  downloadUrl: string;

  @ApiProperty({ minimum: 1 })
  expiresInSeconds: number;
}

export class BookCoverAccessResponseDto {
  @ApiProperty({ format: 'uri' })
  coverUrl: string;

  @ApiProperty({ minimum: 1 })
  expiresInSeconds: number;
}

export class BooksListResponseDto {
  @ApiProperty({ type: () => [BookSummaryResponseDto] })
  books: BookSummaryResponseDto[];

  @ApiProperty({ nullable: true, minimum: 0 })
  nextOffset: number | null;
}

export class CreateBookUploadResponseDto {
  @ApiProperty({ format: 'uuid' })
  bookId: string;

  @ApiProperty({ format: 'uri' })
  uploadUrl: string;
}

export class CompleteBookUploadResponseDto {
  @ApiProperty({ format: 'uuid' })
  bookId: string;

  @ApiProperty({ format: 'uuid' })
  jobId: string;

  @ApiProperty({ enum: ['QUEUED'] })
  parseStatus: 'QUEUED';
}

export class BookDetailResponseDto {
  @ApiProperty({ type: () => BookSummaryResponseDto })
  book: BookSummaryResponseDto;

  @ApiProperty({ type: () => [BookAuthorResponseDto] })
  authors: BookAuthorResponseDto[];

  @ApiProperty({ type: () => [ChapterSummaryResponseDto] })
  chapters: ChapterSummaryResponseDto[];
}

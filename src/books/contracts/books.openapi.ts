import { ApiProperty } from '@nestjs/swagger';

export class BookSummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: ['EPUB'] })
  sourceFormat: 'EPUB';

  @ApiProperty()
  sourceOriginalFilename: string;

  @ApiProperty()
  sourceMimeType: string;

  @ApiProperty({ minimum: 0 })
  sourceSize: number;

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

  @ApiProperty({ type: () => ChapterAudioResponseDto, nullable: true })
  audio: ChapterAudioResponseDto | null;
}

export class ChapterAudioResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: ['QUEUED', 'PROCESSING', 'READY', 'FAILED'] })
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

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
}

export class BooksListResponseDto {
  @ApiProperty({ type: () => [BookSummaryResponseDto] })
  books: BookSummaryResponseDto[];

  @ApiProperty({ nullable: true, minimum: 0 })
  nextOffset: number | null;
}

export class BookDetailResponseDto {
  @ApiProperty({ type: () => BookSummaryResponseDto })
  book: BookSummaryResponseDto;

  @ApiProperty({ type: () => [BookAuthorResponseDto] })
  authors: BookAuthorResponseDto[];

  @ApiProperty({ type: () => [ChapterSummaryResponseDto] })
  chapters: ChapterSummaryResponseDto[];
}

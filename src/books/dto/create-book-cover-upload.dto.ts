import { Type } from 'class-transformer';
import { IsIn, IsInt, Max, Min } from 'class-validator';

export const BOOK_COVER_MIME_TYPES = [
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export const MAX_BOOK_COVER_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

export class CreateBookCoverUploadDto {
  @IsIn(BOOK_COVER_MIME_TYPES)
  mimeType: (typeof BOOK_COVER_MIME_TYPES)[number];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_BOOK_COVER_UPLOAD_SIZE_BYTES)
  size: number;
}

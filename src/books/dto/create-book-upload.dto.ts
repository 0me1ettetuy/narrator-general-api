import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const EPUB_MIME_TYPE = 'application/epub+zip';
export const MAX_EPUB_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;

export class CreateBookUploadDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : undefined,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/\.epub$/i, { message: 'filename must end in .epub' })
  filename: string;

  @IsIn([EPUB_MIME_TYPE])
  mimeType: typeof EPUB_MIME_TYPE;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_EPUB_UPLOAD_SIZE_BYTES)
  size: number;
}

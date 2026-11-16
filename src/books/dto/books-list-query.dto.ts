import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const BOOKS_LIST_SOURCES = ['owned', 'added', 'all'] as const;

export class BooksListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsIn(BOOKS_LIST_SOURCES)
  source?: (typeof BOOKS_LIST_SOURCES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class PublicBooksListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  search?: string;
}

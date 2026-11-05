import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const MAX_COLLECTION_TITLE_LENGTH = 200;
export const MAX_COLLECTION_DESCRIPTION_LENGTH = 1000;

export const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCollectionDto {
  @ApiProperty({ minLength: 1, maxLength: MAX_COLLECTION_TITLE_LENGTH })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_COLLECTION_TITLE_LENGTH)
  title: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MAX_COLLECTION_DESCRIPTION_LENGTH,
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(MAX_COLLECTION_DESCRIPTION_LENGTH)
  description?: string | null;
}

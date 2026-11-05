import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  MAX_COLLECTION_DESCRIPTION_LENGTH,
  MAX_COLLECTION_TITLE_LENGTH,
  trimString,
} from './create-collection.dto.js';

export class UpdateCollectionDto {
  @ApiPropertyOptional({
    minLength: 1,
    maxLength: MAX_COLLECTION_TITLE_LENGTH,
  })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_COLLECTION_TITLE_LENGTH)
  title?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MAX_COLLECTION_DESCRIPTION_LENGTH,
    description: 'Send null to clear the description',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(MAX_COLLECTION_DESCRIPTION_LENGTH)
  description?: string | null;
}

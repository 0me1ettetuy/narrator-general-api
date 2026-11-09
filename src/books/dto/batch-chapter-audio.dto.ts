import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export const MAX_BATCH_CHAPTERS = 1_000;

export class BatchChapterAudioDto {
  @ApiProperty({
    description: 'Chapter IDs selected by the user',
    type: [String],
    format: 'uuid',
    minItems: 1,
    maxItems: MAX_BATCH_CHAPTERS,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH_CHAPTERS)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  chapterIds: string[];

  @ApiPropertyOptional({
    description: 'Fixed local-model voice id; omit for the engine default',
    example: 'xenia',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-z0-9_]+$/)
  voiceId?: string;

  @ApiPropertyOptional({
    description:
      'Discard chapters that already have ready audio and generate it again with the selected model',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  regenerate?: boolean;
}

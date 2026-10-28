import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export const CHAPTER_ROLES = [
  'MAIN',
  'FRONT_MATTER',
  'NAVIGATION',
  'REFERENCE',
  'BACK_MATTER',
  'OTHER',
] as const;

export type ChapterRoleValue = (typeof CHAPTER_ROLES)[number];

export const MAX_CHAPTER_TEXT_LENGTH = 1_000_000;
export const MAX_CHAPTERS_PER_CURATION_COMMAND = 1_000;

function trimText({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateChapterDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trimText)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title?: string;

  @ApiPropertyOptional({ maxLength: MAX_CHAPTER_TEXT_LENGTH })
  @IsOptional()
  @Transform(trimText)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_CHAPTER_TEXT_LENGTH)
  text?: string;

  @ApiPropertyOptional({ enum: CHAPTER_ROLES })
  @IsOptional()
  @IsIn(CHAPTER_ROLES)
  role?: ChapterRoleValue;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  includeInDefaultNarration?: boolean;

  @ApiPropertyOptional({
    description: 'Required when changed text has existing finished audio',
  })
  @ValidateIf((dto: UpdateChapterDto) => dto.text !== undefined)
  @IsBoolean()
  discardAudio?: boolean;
}

export class CreateChapterDto {
  @ApiProperty({ maxLength: 500 })
  @Transform(trimText)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title: string;

  @ApiProperty({ maxLength: MAX_CHAPTER_TEXT_LENGTH })
  @Transform(trimText)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_CHAPTER_TEXT_LENGTH)
  text: string;

  @ApiPropertyOptional({ enum: CHAPTER_ROLES, default: 'MAIN' })
  @IsOptional()
  @IsIn(CHAPTER_ROLES)
  role?: ChapterRoleValue;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  includeInDefaultNarration?: boolean;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Insert after this active chapter; omit to append',
  })
  @IsOptional()
  @IsUUID('4')
  afterChapterId?: string;
}

export class UpdateChapterSelectionDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    minItems: 1,
    maxItems: MAX_CHAPTERS_PER_CURATION_COMMAND,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CHAPTERS_PER_CURATION_COMMAND)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  chapterIds: string[];

  @ApiPropertyOptional({ enum: CHAPTER_ROLES })
  @IsOptional()
  @IsIn(CHAPTER_ROLES)
  role?: ChapterRoleValue;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  includeInDefaultNarration?: boolean;
}

export class MergeChaptersDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    minItems: 2,
    maxItems: MAX_CHAPTERS_PER_CURATION_COMMAND,
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(MAX_CHAPTERS_PER_CURATION_COMMAND)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  chapterIds: string[];

  @ApiProperty({ maxLength: 500 })
  @Transform(trimText)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title: string;

  @ApiProperty({ enum: CHAPTER_ROLES })
  @IsIn(CHAPTER_ROLES)
  role: ChapterRoleValue;

  @ApiProperty()
  @IsBoolean()
  includeInDefaultNarration: boolean;

  @ApiProperty({
    description: 'Confirm removal of existing audio for all merged chapters',
  })
  @IsBoolean()
  discardAudio: boolean;
}

export class RemoveChapterDto {
  @ApiProperty({
    description: 'Confirm removal of existing finished audio for this chapter',
  })
  @IsBoolean()
  discardAudio: boolean;
}

export class UpdateChapterOrderDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    maxItems: MAX_CHAPTERS_PER_CURATION_COMMAND,
    description: 'Every active chapter ID, once, in its new order',
  })
  @IsArray()
  @ArrayMaxSize(MAX_CHAPTERS_PER_CURATION_COMMAND)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  chapterIds: string[];
}

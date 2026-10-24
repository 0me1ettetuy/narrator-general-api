import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class QueueChapterAudioDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9][a-z0-9.-]*$/)
  modelId?: string;
}

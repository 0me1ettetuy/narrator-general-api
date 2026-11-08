import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class QueueChapterAudioDto {
  @ApiPropertyOptional({ example: 'local.silero-tts' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9][a-z0-9.-]*$/)
  modelId?: string;

  @ApiPropertyOptional({
    description: 'Fixed local-model voice id; omit for the engine default',
    example: 'xenia',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-z0-9_]+$/)
  voiceId?: string;
}

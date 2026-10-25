import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';

export class SelectTtsModelDto {
  @ApiProperty({
    description: 'A ready TTS model ID returned by GET /tts/models',
    example: 'local.kokoro-82m',
    maxLength: 100,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9][a-z0-9.-]*$/)
  modelId: string;
}

import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AddFishVoiceDto {
  @ApiProperty({
    description: 'Fish Audio reference voice ID to save for the current user.',
    example: 'bf322df2096a46f18c579d0baa36f41d',
    maxLength: 256,
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : undefined,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  referenceId: string;

  @ApiPropertyOptional({
    description: 'Optional personal label for this saved voice.',
    example: 'My narration voice',
    maxLength: 80,
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : undefined,
  )
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;
}

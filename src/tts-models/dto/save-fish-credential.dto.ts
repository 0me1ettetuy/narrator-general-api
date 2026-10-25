import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SaveFishCredentialDto {
  @ApiProperty({
    description:
      'Fish Audio API key. This write-only value is encrypted before storage and is never returned.',
    format: 'password',
    maxLength: 1_024,
    minLength: 8,
    writeOnly: true,
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : undefined,
  )
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(1_024)
  apiKey: string;
}

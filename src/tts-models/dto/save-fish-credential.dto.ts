import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class SaveFishCredentialDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : undefined,
  )
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(1_024)
  apiKey: string;
}

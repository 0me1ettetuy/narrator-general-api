import { IsEmail, IsString, MinLength, MaxLength, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeEmail } from '../utils/normalize-email';

export class RegisterDto {
  @Transform(({ value }) => normalizeEmail(value))
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}

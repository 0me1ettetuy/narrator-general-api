import { IsString, IsEmail, MaxLength, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeEmail } from '../../users/utils/normalize-email.js';

export class LoginDto {
  @Transform(({ value }) => normalizeEmail(value))
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(72)
  password: string;
}

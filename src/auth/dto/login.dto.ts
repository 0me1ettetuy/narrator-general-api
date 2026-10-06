import { IsString, IsEmail, MaxLength, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { normalizeEmail } from '../../users/utils/normalize-email.js';

export class LoginDto {
  @ApiProperty({ format: 'email', maxLength: 254 })
  @Transform(({ value }) => normalizeEmail(value))
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ maxLength: 72 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(72)
  password: string;
}

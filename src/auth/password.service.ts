import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';

const DEFAULT_BCRYPT_SALT_ROUNDS = 12;

@Injectable()
export class PasswordService {
  constructor(private readonly configService: ConfigService) {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.getSaltRounds());
  }

  async comparePassword(
    password: string,
    passwordHash: string,
  ): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }

  private getSaltRounds(): number {
    const saltRounds = Number(
      this.configService.get<string>('BCRYPT_SALT_ROUNDS'),
    );

    return Number.isInteger(saltRounds) && saltRounds > 0
      ? saltRounds
      : DEFAULT_BCRYPT_SALT_ROUNDS;
  }
}

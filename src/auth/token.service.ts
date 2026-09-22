import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import type { JwtPayload } from './types/jwt.type';
import type { RefreshPayload } from './types/refresh.type';
import {
  buildJwtPayload,
  buildRefreshPayload,
} from './utils/build-jwt-payload';
import type { SafeUser } from '@/users/types/safe-user.type';

type JwtExpiresIn = NonNullable<JwtSignOptions['expiresIn']>;

const DEFAULT_ACCESS_TOKEN_TTL: JwtExpiresIn = '15m';
const DEFAULT_REFRESH_TOKEN_TTL: JwtExpiresIn = '7d';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async createAccessToken(user: SafeUser): Promise<string> {
    return this.jwtService.signAsync(buildJwtPayload(user), {
      secret: this.getRequiredConfig('JWT_ACCESS_SECRET'),
      expiresIn: this.getConfig('ACCESS_TOKEN_TTL', DEFAULT_ACCESS_TOKEN_TTL),
    });
  }

  async createRefreshToken(user: SafeUser, sessionId: string): Promise<string> {
    return this.jwtService.signAsync(buildRefreshPayload(user, sessionId), {
      secret: this.getRequiredConfig('JWT_REFRESH_SECRET'),
      expiresIn: this.getConfig('REFRESH_TOKEN_TTL', DEFAULT_REFRESH_TOKEN_TTL),
    });
  }

  async verifyAccessToken(token: string): Promise<JwtPayload> {
    return this.jwtService.verifyAsync<JwtPayload>(token, {
      secret: this.getRequiredConfig('JWT_ACCESS_SECRET'),
    });
  }

  async verifyRefreshToken(token: string): Promise<RefreshPayload> {
    return this.jwtService.verifyAsync<RefreshPayload>(token, {
      secret: this.getRequiredConfig('JWT_REFRESH_SECRET'),
    });
  }

  private getConfig(key: string, fallback: JwtExpiresIn): JwtExpiresIn {
    const value = this.configService.get<string>(key);

    if (!value) {
      return fallback;
    }

    if (/^\d+$/.test(value)) {
      return Number(value);
    }

    if (/^\d+\s?(ms|s|m|h|d|w|y)$/i.test(value)) {
      return value as JwtExpiresIn;
    }

    return fallback;
  }

  private getRequiredConfig(key: string): string {
    const value = this.configService.get<string>(key);

    if (!value) {
      throw new Error(`${key} is required`);
    }

    return value;
  }
}

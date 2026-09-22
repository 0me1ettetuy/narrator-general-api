import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { RefreshPayload } from '../types/refresh.type.js';
import { REFRESH_TOKEN_COOKIE_NAME } from '../utils/cookie-options.js';

export type AuthenticatedRefreshPayload = RefreshPayload & {
  refreshToken: string;
};

const extractRefreshTokenFromCookie = (request: Request): string | null => {
  const token = request.cookies?.[REFRESH_TOKEN_COOKIE_NAME];

  return typeof token === 'string' && token.length > 0 ? token : null;
};

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        extractRefreshTokenFromCookie,
      ]),
      ignoreExpiration: false,
      passReqToCallback: true,
      secretOrKey: configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
    });
  }

  validate(
    request: Request,
    payload: RefreshPayload,
  ): AuthenticatedRefreshPayload {
    const refreshToken = extractRefreshTokenFromCookie(request);

    if (payload.type !== 'refresh' || !refreshToken) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      ...payload,
      refreshToken,
    };
  }
}

import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import {
  getClearLegacyRefreshCookieOptions,
  getClearRefreshCookieOptions,
  getRefreshCookieOptions,
  REFRESH_TOKEN_COOKIE_NAME,
} from './utils/cookie-options.js';

@Injectable()
export class CookieService {
  setRefreshCookie(response: Response, refreshToken: string): void {
    response.clearCookie(
      REFRESH_TOKEN_COOKIE_NAME,
      getClearLegacyRefreshCookieOptions(),
    );
    response.cookie(
      REFRESH_TOKEN_COOKIE_NAME,
      refreshToken,
      getRefreshCookieOptions(),
    );
  }

  clearRefreshCookie(response: Response): void {
    response.clearCookie(
      REFRESH_TOKEN_COOKIE_NAME,
      getClearRefreshCookieOptions(),
    );
    response.clearCookie(
      REFRESH_TOKEN_COOKIE_NAME,
      getClearLegacyRefreshCookieOptions(),
    );
  }
}

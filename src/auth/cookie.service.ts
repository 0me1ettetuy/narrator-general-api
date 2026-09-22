import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import {
  getClearRefreshCookieOptions,
  getRefreshCookieOptions,
  REFRESH_TOKEN_COOKIE_NAME,
} from './utils/cookie-options.js';

@Injectable()
export class CookieService {
  setRefreshCookie(response: Response, refreshToken: string): void {
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
  }
}

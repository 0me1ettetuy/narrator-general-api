import type { CookieOptions } from 'express';

export const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';
export const REFRESH_TOKEN_COOKIE_PATH = '/auth';

const DEFAULT_REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const getRefreshCookieMaxAge = (): number => {
  const rawMaxAge = process.env.REFRESH_TOKEN_COOKIE_MAX_AGE_MS;
  const maxAge = rawMaxAge === undefined ? NaN : Number(rawMaxAge.trim());

  return Number.isFinite(maxAge) && maxAge > 0
    ? maxAge
    : DEFAULT_REFRESH_COOKIE_MAX_AGE_MS;
};

export const getBaseRefreshCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: REFRESH_TOKEN_COOKIE_PATH,
});

export const getRefreshCookieOptions = (): CookieOptions => ({
  ...getBaseRefreshCookieOptions(),
  maxAge: getRefreshCookieMaxAge(),
});

export const getClearRefreshCookieOptions = (): CookieOptions => ({
  ...getBaseRefreshCookieOptions(),
  expires: new Date(0),
  maxAge: 0,
});

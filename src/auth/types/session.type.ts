import type { Instant } from '../../prisma/temporal.js';

export type Session = {
  id: string;
  refreshTokenHash: string;
  userId: string;
  createdAt: Instant;
  expiresAt: Instant;
  revokedAt: Instant | null;
};

export type CreateSessionInput = {
  userId: string;
  refreshToken: string;
  expiresAt: Instant;
  sessionId?: string;
};

export type RotateRefreshTokenInput = {
  sessionId: string;
  refreshToken: string;
  expiresAt: Instant;
};

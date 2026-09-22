export type Session = {
  id: string;
  refreshTokenHash: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type CreateSessionInput = {
  userId: string;
  refreshToken: string;
  expiresAt: Date;
  sessionId?: string;
};

export type RotateRefreshTokenInput = {
  sessionId: string;
  refreshToken: string;
  expiresAt: Date;
};

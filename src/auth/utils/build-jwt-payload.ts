import type { JwtPayload } from '../types/jwt.type.js';
import type { RefreshPayload } from '../types/refresh.type.js';
import type { SafeUser } from '../../users/types/safe-user.type.js';

export const buildJwtPayload = (user: SafeUser): JwtPayload => ({
  sub: user.id,
  email: user.email,
  type: 'access',
});

export const buildRefreshPayload = (
  user: SafeUser,
  sessionId: string,
): RefreshPayload => ({
  sub: user.id,
  sessionId,
  type: 'refresh',
});

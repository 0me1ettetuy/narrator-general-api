import type { JwtPayload } from '@/auth/types/jwt.type';
import type { RefreshPayload } from '@/auth/types/refresh.type';
import type { SafeUser } from '@/users/types/safe-user.type';

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

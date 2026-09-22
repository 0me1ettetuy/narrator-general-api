import type { SafeUser } from '../../users/types/safe-user.type.js';

export type AuthResponse = {
  user: SafeUser;
  accessToken: string;
};

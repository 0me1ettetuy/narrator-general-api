import type { SafeUser } from '@/users/types/safe-user.type';

export type AuthResponse = {
  user: SafeUser;
  accessToken: string;
};

import type { SafeUser } from '../types/safe-user.type.js';
import type { User } from '../types/user.type.js';

export const toSafeUser = ({
  id,
  email,
  createdAt,
  updatedAt,
}: User): SafeUser => ({
  id,
  email,
  createdAt,
  updatedAt,
});

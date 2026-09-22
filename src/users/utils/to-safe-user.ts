import { SafeUser } from '../types/safe-user.type';
import { User } from '../types/user.type';

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

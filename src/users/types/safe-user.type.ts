import type { Instant } from '../../prisma/temporal.js';

export type SafeUser = {
  id: string;
  email: string;
  createdAt: Instant;
  updatedAt: Instant;
};

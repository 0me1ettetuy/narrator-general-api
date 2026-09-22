import type { Instant } from '../../prisma/temporal.js';

export type User = {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Instant;
  updatedAt: Instant;
};

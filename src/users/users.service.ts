import { PrismaService } from '../prisma/prisma.service.js';
import { ConflictException, Injectable } from '@nestjs/common';
import type { CreateUserInput } from './types/create-user.type.js';
import type { SafeUser } from './types/safe-user.type.js';
import type { User } from './types/user.type.js';
import { normalizeEmail } from './utils/normalize-email.js';
import { toSafeUser } from './utils/to-safe-user.js';
import { temporalNow } from '../prisma/temporal.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(input: CreateUserInput): Promise<User> {
    const email = normalizeEmail(input.email);
    const existingUser = await this.findByEmail(email);

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    return this.prisma.db.orm.public.User.create({
      email,
      passwordHash: input.passwordHash,
      updatedAt: temporalNow(),
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.db.orm.public.User.where({
      email: normalizeEmail(email),
    }).first();
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.db.orm.public.User.where({ id }).first();
  }

  toSafeUser(user: User): SafeUser {
    return toSafeUser(user);
  }
}

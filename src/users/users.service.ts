import { PrismaService } from '@/prisma/prisma.service';
import { ConflictException, Injectable } from '@nestjs/common';
import type { CreateUserInput } from './types/create-user.type';
import type { SafeUser } from './types/safe-user.type';
import type { User } from './types/user.type';
import { normalizeEmail } from './utils/normalize-email';
import { toSafeUser } from './utils/to-safe-user';

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
      updatedAt: new Date(),
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

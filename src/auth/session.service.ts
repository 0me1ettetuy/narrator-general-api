import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { PasswordService } from './password.service';
import type {
  CreateSessionInput,
  RotateRefreshTokenInput,
  Session,
} from './types/session.type';

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  async createSession(input: CreateSessionInput): Promise<Session> {
    const refreshTokenHash = await this.hashRefreshToken(input.refreshToken);

    return this.prisma.db.orm.public.Session.create({
      id: input.sessionId ?? randomUUID(),
      userId: input.userId,
      refreshTokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
    });
  }

  async findById(sessionId: string): Promise<Session | null> {
    return this.prisma.db.orm.public.Session.first({ id: sessionId });
  }

  async rotateRefreshToken(
    input: RotateRefreshTokenInput,
  ): Promise<Session | null> {
    const refreshTokenHash = await this.hashRefreshToken(input.refreshToken);

    return this.prisma.db.orm.public.Session.where({
      id: input.sessionId,
    }).update({
      refreshTokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
    });
  }

  async revokeSession(sessionId: string): Promise<Session | null> {
    return this.prisma.db.orm.public.Session.where({ id: sessionId }).update({
      revokedAt: new Date(),
    });
  }

  async revokeUserSessions(userId: string): Promise<Session[]> {
    const sessions = await this.prisma.db.orm.public.Session.where({
      userId,
    }).all();

    const revokedSessions = await Promise.all(
      sessions.map((session) => this.revokeSession(session.id)),
    );

    return revokedSessions.filter((session): session is Session => !!session);
  }

  async isRefreshTokenValid(
    session: Session,
    refreshToken: string,
  ): Promise<boolean> {
    if (session.revokedAt || session.expiresAt <= new Date()) {
      return false;
    }

    return this.passwordService.comparePassword(
      refreshToken,
      session.refreshTokenHash,
    );
  }

  async detectRefreshTokenReuse(
    sessionId: string,
    refreshToken: string,
  ): Promise<boolean> {
    const session = await this.findById(sessionId);

    if (!session || session.revokedAt) {
      return true;
    }

    const matches = await this.passwordService.comparePassword(
      refreshToken,
      session.refreshTokenHash,
    );

    if (!matches) {
      await this.revokeSession(session.id);
      return true;
    }

    return false;
  }

  async hashRefreshToken(refreshToken: string): Promise<string> {
    return this.passwordService.hashPassword(refreshToken);
  }
}

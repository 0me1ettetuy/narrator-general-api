import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { UsersService } from '@/users/users.service';
import type { SafeUser } from '@/users/types/safe-user.type';
import { RegisterDto } from './dto/register.dto';
import { CookieService } from './cookie.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';
import type { AuthResponse } from './contracts/auth.response';
import type { LogoutResponse } from './contracts/logout.response';
import type { MeResponse } from './contracts/me.response';
import type { RefreshResponse } from './contracts/refresh.response';
import type { RefreshPayload } from './types/refresh.type';

const DEFAULT_REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
    private readonly cookieService: CookieService,
  ) {}

  async register(dto: RegisterDto, response: Response): Promise<AuthResponse> {
    const passwordHash = await this.passwordService.hashPassword(dto.password);
    const user = await this.usersService.createUser({
      email: dto.email,
      passwordHash,
    });

    return this.createAuthSession(this.usersService.toSafeUser(user), response);
  }

  async login(user: SafeUser, response: Response): Promise<AuthResponse> {
    return this.createAuthSession(user, response);
  }

  async validateUser(email: string, password: string): Promise<SafeUser> {
    const user = await this.validateCredentials(email, password);

    return this.usersService.toSafeUser(user);
  }

  async refresh(
    refreshToken: string | undefined,
    response: Response,
  ): Promise<RefreshResponse> {
    if (!refreshToken) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = await this.verifyRefreshPayload(refreshToken);
    const isReused = await this.sessionService.detectRefreshTokenReuse(
      payload.sessionId,
      refreshToken,
    );

    if (isReused) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      await this.sessionService.revokeSession(payload.sessionId);
      throw new UnauthorizedException('Invalid credentials');
    }

    const safeUser = this.usersService.toSafeUser(user);
    const newRefreshToken = await this.tokenService.createRefreshToken(
      safeUser,
      payload.sessionId,
    );

    await this.sessionService.rotateRefreshToken({
      sessionId: payload.sessionId,
      refreshToken: newRefreshToken,
      expiresAt: this.getRefreshTokenExpiresAt(),
    });
    this.cookieService.setRefreshCookie(response, newRefreshToken);

    return {
      accessToken: await this.tokenService.createAccessToken(safeUser),
    };
  }

  async logout(
    refreshToken: string | undefined,
    response: Response,
  ): Promise<LogoutResponse> {
    if (refreshToken) {
      const payload = await this.tryVerifyRefreshPayload(refreshToken);

      if (payload) {
        await this.sessionService.revokeSession(payload.sessionId);
      }
    }

    this.cookieService.clearRefreshCookie(response);

    return { success: true };
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      user: this.usersService.toSafeUser(user),
    };
  }

  private async validateCredentials(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await this.passwordService.comparePassword(
      password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  private async createAuthSession(
    user: SafeUser,
    response: Response,
  ): Promise<AuthResponse> {
    const sessionId = randomUUID();
    const refreshToken = await this.tokenService.createRefreshToken(
      user,
      sessionId,
    );

    await this.sessionService.createSession({
      sessionId,
      userId: user.id,
      refreshToken,
      expiresAt: this.getRefreshTokenExpiresAt(),
    });
    this.cookieService.setRefreshCookie(response, refreshToken);

    return {
      user,
      accessToken: await this.tokenService.createAccessToken(user),
    };
  }

  private async verifyRefreshPayload(
    refreshToken: string,
  ): Promise<RefreshPayload> {
    try {
      const payload = await this.tokenService.verifyRefreshToken(refreshToken);

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid credentials');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  private async tryVerifyRefreshPayload(
    refreshToken: string,
  ): Promise<RefreshPayload | null> {
    try {
      return await this.verifyRefreshPayload(refreshToken);
    } catch {
      return null;
    }
  }

  private getRefreshTokenExpiresAt(): Date {
    const maxAge = Number(process.env.REFRESH_TOKEN_COOKIE_MAX_AGE_MS);
    const ttlMs =
      Number.isFinite(maxAge) && maxAge > 0
        ? maxAge
        : DEFAULT_REFRESH_TOKEN_TTL_MS;

    return new Date(Date.now() + ttlMs);
  }
}

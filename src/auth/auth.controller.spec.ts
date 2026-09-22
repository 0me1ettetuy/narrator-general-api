jest.mock('@/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('./auth.service', () => ({
  AuthService: class AuthService {},
}));
jest.mock('./guards/jwt-access.guard', () => ({
  JwtAccessGuard: class JwtAccessGuard {},
}));
jest.mock('./guards/jwt-refresh.guard', () => ({
  JwtRefreshGuard: class JwtRefreshGuard {},
}));
jest.mock('./guards/local-auth.guard', () => ({
  LocalAuthGuard: class LocalAuthGuard {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { AuthResponse } from './contracts/auth.response';
import type { LogoutResponse } from './contracts/logout.response';
import type { MeResponse } from './contracts/me.response';
import type { RefreshResponse } from './contracts/refresh.response';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import type { JwtPayload } from './types/jwt.type';
import type { AuthenticatedRefreshPayload } from './strategies/jwt-refresh.strategy';
import type { SafeUser } from '@/users/types/safe-user.type';
import type { Request, Response } from 'express';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  const response = {} as Response;
  const safeUser: SafeUser = {
    id: 'user-id',
    email: 'user@example.com',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(async () => {
    authService = {
      register: jest.fn(),
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
      me: jest.fn(),
    } as unknown as jest.Mocked<AuthService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns a csrf token from the csrf middleware request helper', () => {
    const request = {
      csrfToken: jest.fn().mockReturnValue('csrf-token'),
    } as unknown as Request;

    expect(controller.csrf(request)).toEqual({ csrfToken: 'csrf-token' });
  });

  it('registers with the auth service', async () => {
    const dto: RegisterDto = {
      email: 'user@example.com',
      password: 'password123',
    };
    const expected: AuthResponse = {
      user: safeUser,
      accessToken: 'access-token',
    };
    authService.register.mockResolvedValue(expected);

    await expect(controller.register(dto, response)).resolves.toEqual(expected);
    expect(authService.register).toHaveBeenCalledWith(dto, response);
  });

  it('logs in with the locally authenticated user', async () => {
    const dto: LoginDto = {
      email: 'user@example.com',
      password: 'password123',
    };
    const request = { user: safeUser } as Request & { user: SafeUser };
    const expected: AuthResponse = {
      user: safeUser,
      accessToken: 'access-token',
    };
    authService.login.mockResolvedValue(expected);

    await expect(controller.login(dto, request, response)).resolves.toEqual(
      expected,
    );
    expect(authService.login).toHaveBeenCalledWith(safeUser, response);
  });

  it('refreshes with the refresh token attached by the refresh guard', async () => {
    const request = {
      user: {
        sub: safeUser.id,
        sessionId: 'session-id',
        type: 'refresh',
        refreshToken: 'refresh-token',
      },
    } as Request & { user: AuthenticatedRefreshPayload };
    const expected: RefreshResponse = {
      accessToken: 'new-access-token',
    };
    authService.refresh.mockResolvedValue(expected);

    await expect(controller.refresh(request, response)).resolves.toEqual(
      expected,
    );
    expect(authService.refresh).toHaveBeenCalledWith('refresh-token', response);
  });

  it('logs out with the refresh cookie when present', async () => {
    const request = {
      cookies: {
        refreshToken: 'refresh-token',
      },
    } as unknown as Request & { cookies: Record<string, unknown> };
    const expected: LogoutResponse = { success: true };
    authService.logout.mockResolvedValue(expected);

    await expect(controller.logout(request, response)).resolves.toEqual(
      expected,
    );
    expect(authService.logout).toHaveBeenCalledWith('refresh-token', response);
  });

  it('loads the current user from the access token payload', async () => {
    const request = {
      user: {
        sub: safeUser.id,
        email: safeUser.email,
        type: 'access',
      },
    } as Request & { user: JwtPayload };
    const expected: MeResponse = { user: safeUser };
    authService.me.mockResolvedValue(expected);

    await expect(controller.me(request)).resolves.toEqual(expected);
    expect(authService.me).toHaveBeenCalledWith(safeUser.id);
  });
});

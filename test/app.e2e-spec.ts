jest.mock('../src/auth/auth.service', () => ({
  AuthService: class AuthService {},
}));
jest.mock('../src/auth/guards/local-auth.guard', () => ({
  LocalAuthGuard: class LocalAuthGuard {
    canActivate(context: {
      switchToHttp: () => { getRequest: () => Record<string, unknown> };
    }) {
      context.switchToHttp().getRequest().user = {
        id: 'user-id',
        email: 'user@example.com',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      };

      return true;
    }
  },
}));
jest.mock('../src/auth/guards/jwt-access.guard', () => ({
  JwtAccessGuard: class JwtAccessGuard {
    canActivate(context: {
      switchToHttp: () => { getRequest: () => Record<string, unknown> };
    }) {
      context.switchToHttp().getRequest().user = {
        sub: 'user-id',
        email: 'user@example.com',
        type: 'access',
      };

      return true;
    }
  },
}));
jest.mock('../src/auth/guards/jwt-refresh.guard', () => ({
  JwtRefreshGuard: class JwtRefreshGuard {
    canActivate(context: {
      switchToHttp: () => { getRequest: () => Record<string, unknown> };
    }) {
      context.switchToHttp().getRequest().user = {
        sub: 'user-id',
        sessionId: 'session-id',
        type: 'refresh',
        refreshToken: 'refresh-token',
      };

      return true;
    }
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { RequestHandler } from 'express';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;
  let authService: {
    register: jest.Mock;
    login: jest.Mock;
    refresh: jest.Mock;
    logout: jest.Mock;
    me: jest.Mock;
  };

  const safeUser = {
    id: 'user-id',
    email: 'user@example.com',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    authService = {
      register: jest.fn().mockResolvedValue({
        user: safeUser,
        accessToken: 'access-token',
      }),
      login: jest.fn().mockResolvedValue({
        user: safeUser,
        accessToken: 'access-token',
      }),
      refresh: jest.fn().mockResolvedValue({
        accessToken: 'new-access-token',
      }),
      logout: jest.fn().mockResolvedValue({ success: true }),
      me: jest.fn().mockResolvedValue({ user: safeUser }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(((request, _response, next) => {
      request.csrfToken = () => 'csrf-token';
      next();
    }) as RequestHandler);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/auth/csrf (GET)', () => {
    return request(app.getHttpServer())
      .get('/auth/csrf')
      .expect(200)
      .expect({ csrfToken: 'csrf-token' });
  });

  it('/auth/register (POST)', () => {
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'user@example.com', password: 'password123' })
      .expect(201)
      .expect({
        user: safeUser,
        accessToken: 'access-token',
      });
  });

  it('/auth/login (POST)', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'user@example.com', password: 'password123' })
      .expect(201)
      .expect({
        user: safeUser,
        accessToken: 'access-token',
      });
  });

  it('/auth/refresh (POST)', () => {
    return request(app.getHttpServer())
      .post('/auth/refresh')
      .expect(201)
      .expect({
        accessToken: 'new-access-token',
      });
  });

  it('/auth/logout (POST)', () => {
    return request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', ['refreshToken=refresh-token'])
      .expect(201)
      .expect({ success: true });
  });

  it('/auth/me (GET)', () => {
    return request(app.getHttpServer())
      .get('/auth/me')
      .expect(200)
      .expect({ user: safeUser });
  });
});

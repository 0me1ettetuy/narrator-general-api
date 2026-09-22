jest.mock('@/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('./cookie.service', () => ({
  CookieService: class CookieService {},
}));
jest.mock('./password.service', () => ({
  PasswordService: class PasswordService {},
}));
jest.mock('./session.service', () => ({
  SessionService: class SessionService {},
}));
jest.mock('./token.service', () => ({
  TokenService: class TokenService {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { CookieService } from './cookie.service';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';
import { UsersService } from '@/users/users.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: {} },
        { provide: PasswordService, useValue: {} },
        { provide: TokenService, useValue: {} },
        { provide: SessionService, useValue: {} },
        { provide: CookieService, useValue: {} },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { TokenService } from './token.service.js';
import { CookieService } from './cookie.service.js';
import { LocalStrategy } from './strategies/local.strategy.js';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy.js';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy.js';
import { LocalAuthGuard } from './guards/local-auth.guard.js';
import { JwtAccessGuard } from './guards/jwt-access.guard.js';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard.js';

@Module({
  imports: [PassportModule, JwtModule.register({}), PrismaModule, UsersModule],
  providers: [
    AuthService,
    PasswordService,
    SessionService,
    TokenService,
    CookieService,
    LocalStrategy,
    JwtAccessStrategy,
    JwtRefreshStrategy,
    LocalAuthGuard,
    JwtAccessGuard,
    JwtRefreshGuard,
  ],
  controllers: [AuthController],
})
export class AuthModule {}

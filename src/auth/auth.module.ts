import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '@/prisma/prisma.module';
import { UsersModule } from '@/users/users.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';
import { CookieService } from './cookie.service';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAccessGuard } from './guards/jwt-access.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';

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

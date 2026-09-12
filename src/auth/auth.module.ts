import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';
import { CookieService } from './cookie.service';

@Module({
  providers: [AuthService, PasswordService, SessionService, TokenService, CookieService],
  controllers: [AuthController],
})
export class AuthModule {}

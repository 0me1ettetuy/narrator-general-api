import {
  Body,
  Controller,
  Get,
  InternalServerErrorException,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { SafeUser } from '@/users/types/safe-user.type';
import { AuthService } from './auth.service';
import type { AuthResponse } from './contracts/auth.response';
import type { CsrfResponse } from './contracts/csrf.response';
import type { LogoutResponse } from './contracts/logout.response';
import type { MeResponse } from './contracts/me.response';
import type { RefreshResponse } from './contracts/refresh.response';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAccessGuard } from './guards/jwt-access.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import type { JwtPayload } from './types/jwt.type';
import type { AuthenticatedRefreshPayload } from './strategies/jwt-refresh.strategy';
import { REFRESH_TOKEN_COOKIE_NAME } from './utils/cookie-options';

type RequestWithUser<TUser> = Request & {
  user: TUser;
};

type RequestWithCookies = Request & {
  cookies?: Record<string, unknown>;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('csrf')
  csrf(@Req() request: Request): CsrfResponse {
    const csrfToken = request.csrfToken?.({ overwrite: true });

    if (!csrfToken) {
      throw new InternalServerErrorException('CSRF is not configured');
    }

    return { csrfToken };
  }

  @Post('register')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    return this.authService.register(dto, response);
  }

  @Post('login')
  @UseGuards(LocalAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  login(
    @Body() _dto: LoginDto,
    @Req() request: RequestWithUser<SafeUser>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    return this.authService.login(request.user, response);
  }

  @Post('refresh')
  @UseGuards(JwtRefreshGuard)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  refresh(
    @Req() request: RequestWithUser<AuthenticatedRefreshPayload>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RefreshResponse> {
    return this.authService.refresh(request.user.refreshToken, response);
  }

  @Post('logout')
  logout(
    @Req() request: RequestWithCookies,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LogoutResponse> {
    return this.authService.logout(this.getRefreshToken(request), response);
  }

  @Get('me')
  @UseGuards(JwtAccessGuard)
  me(@Req() request: RequestWithUser<JwtPayload>): Promise<MeResponse> {
    return this.authService.me(request.user.sub);
  }

  private getRefreshToken(request: RequestWithCookies): string | undefined {
    const refreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE_NAME];

    return typeof refreshToken === 'string' ? refreshToken : undefined;
  }
}

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
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { SafeUser } from '../users/types/safe-user.type.js';
import { AuthService } from './auth.service.js';
import type { AuthResponse } from './contracts/auth.response.js';
import type { CsrfResponse } from './contracts/csrf.response.js';
import type { LogoutResponse } from './contracts/logout.response.js';
import type { MeResponse } from './contracts/me.response.js';
import type { RefreshResponse } from './contracts/refresh.response.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { JwtAccessGuard } from './guards/jwt-access.guard.js';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard.js';
import { LocalAuthGuard } from './guards/local-auth.guard.js';
import type { JwtPayload } from './types/jwt.type.js';
import type { AuthenticatedRefreshPayload } from './strategies/jwt-refresh.strategy.js';
import { REFRESH_TOKEN_COOKIE_NAME } from './utils/cookie-options.js';
import {
  AuthResponseDto,
  CsrfResponseDto,
  LogoutResponseDto,
  MeResponseDto,
  RefreshResponseDto,
} from './contracts/auth.openapi.js';

type RequestWithUser<TUser> = Request & {
  user: TUser;
};

type RequestWithCookies = Request & {
  cookies?: Record<string, unknown>;
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('csrf')
  @ApiOperation({
    summary: 'Create a CSRF token for cookie-authenticated mutations',
  })
  @ApiOkResponse({ type: CsrfResponseDto })
  csrf(@Req() request: Request): CsrfResponse {
    const csrfToken = request.csrfToken?.({ overwrite: true });

    if (!csrfToken) {
      throw new InternalServerErrorException('CSRF is not configured');
    }

    return { csrfToken };
  }

  @Post('register')
  @ApiOperation({
    summary: 'Register a user and create an authenticated session',
  })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    return this.authService.register(dto, response);
  }

  @Post('login')
  @ApiOperation({ summary: 'Log in and create an authenticated session' })
  @ApiBody({ type: LoginDto })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
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
  @ApiOperation({
    summary: 'Rotate the refresh cookie and issue a new access token',
  })
  @ApiCookieAuth(REFRESH_TOKEN_COOKIE_NAME)
  @ApiCreatedResponse({ type: RefreshResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or reused refresh token' })
  @UseGuards(JwtRefreshGuard)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  refresh(
    @Req() request: RequestWithUser<AuthenticatedRefreshPayload>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RefreshResponse> {
    return this.authService.refresh(request.user.refreshToken, response);
  }

  @Post('logout')
  @ApiOperation({ summary: 'End the current authenticated session' })
  @ApiCreatedResponse({ type: LogoutResponseDto })
  logout(
    @Req() request: RequestWithCookies,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LogoutResponse> {
    return this.authService.logout(this.getRefreshToken(request), response);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get the current user' })
  @ApiBearerAuth()
  @ApiOkResponse({ type: MeResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  @UseGuards(JwtAccessGuard)
  me(@Req() request: RequestWithUser<JwtPayload>): Promise<MeResponse> {
    return this.authService.me(request.user.sub);
  }

  private getRefreshToken(request: RequestWithCookies): string | undefined {
    const refreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE_NAME];

    return typeof refreshToken === 'string' ? refreshToken : undefined;
  }
}

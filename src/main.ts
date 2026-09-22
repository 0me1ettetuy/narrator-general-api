import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { AllExceptionsFilter } from '@/global-filters/all-exceptions.filter';
import { HttpExceptionFilter } from '@/global-filters/http-exception.filter';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { doubleCsrf } from 'csrf-csrf';
import type { Request } from 'express';
import { REFRESH_TOKEN_COOKIE_NAME } from './auth/utils/cookie-options';

type RequestWithCookies = Request & {
  cookies?: Record<string, unknown>;
};

const CSRF_TOKEN_COOKIE_NAME = 'x-csrf-token';

const getCookieValue = (
  request: RequestWithCookies,
  cookieName: string,
): string | undefined => {
  const cookieValue = request.cookies?.[cookieName];

  return typeof cookieValue === 'string' ? cookieValue : undefined;
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);
  const httpAdapterHost = app.get(HttpAdapterHost);

  app.enableCors({
    origin: configService.get<string>('CLIENT_ORIGIN'),
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });
  app.use(cookieParser());
  const { doubleCsrfProtection } = doubleCsrf({
    getSecret: () =>
      configService.get<string>('CSRF_SECRET') ??
      configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
    getSessionIdentifier: (request) =>
      getCookieValue(request, REFRESH_TOKEN_COOKIE_NAME) ??
      request.ip ??
      'anonymous',
    cookieName: CSRF_TOKEN_COOKIE_NAME,
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
  });
  app.use(doubleCsrfProtection);
  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(
    new HttpExceptionFilter(configService),
    new AllExceptionsFilter(httpAdapterHost),
  );

  await app.listen(process.env.PORT ?? 3000);
  logger.log(`Application is running at port ${process.env.PORT ?? 3000}`);
}
void bootstrap();

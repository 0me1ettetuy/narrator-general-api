import {
  Catch,
  HttpException,
  ExceptionFilter,
  ArgumentsHost,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { createApiErrorResponse } from './api-error.js';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private configService: ConfigService) {}

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();

    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    this.logger.error(`Exception: ${exception.message}, status: ${status}`);

    const responseBody = createApiErrorResponse(
      status,
      exception.getResponse(),
      exception.message,
    );

    response
      .status(status)
      .json(
        isProduction
          ? responseBody
          : { ...responseBody, stackTrace: exception.stack },
      );
  }
}

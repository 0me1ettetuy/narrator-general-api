import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { createApiErrorResponse } from './api-error.js';

const CLIENT_ERROR_STATUS_MIN = 400;
const INTERNAL_SERVER_ERROR_STATUS = 500;

function getHttpStatus(exception: unknown): number {
  if (
    exception &&
    typeof exception === 'object' &&
    (('statusCode' in exception &&
      typeof exception.statusCode === 'number' &&
      exception.statusCode >= CLIENT_ERROR_STATUS_MIN &&
      exception.statusCode < INTERNAL_SERVER_ERROR_STATUS) ||
      ('status' in exception &&
        typeof exception.status === 'number' &&
        exception.status >= CLIENT_ERROR_STATUS_MIN &&
        exception.status < INTERNAL_SERVER_ERROR_STATUS))
  ) {
    return 'statusCode' in exception && typeof exception.statusCode === 'number'
      ? exception.statusCode
      : (exception as { status: number }).status;
  }

  return INTERNAL_SERVER_ERROR_STATUS;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const httpStatus = getHttpStatus(exception);
    const message =
      exception instanceof Error ? exception.message : 'Unknown exception';
    const stack = exception instanceof Error ? exception.stack : undefined;

    this.logger.error(
      `Exception: ${message}, status: ${httpStatus}, stack: ${stack}`,
    );

    const responseBody = createApiErrorResponse(httpStatus, exception, message);

    httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus);
  }
}

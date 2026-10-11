import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

const CLIENT_ERROR_STATUS_MIN = 400;
const INTERNAL_SERVER_ERROR_STATUS = 500;

function getHttpStatus(exception: unknown): number {
  if (
    exception &&
    typeof exception === 'object' &&
    'statusCode' in exception &&
    typeof exception.statusCode === 'number' &&
    exception.statusCode >= CLIENT_ERROR_STATUS_MIN &&
    exception.statusCode < INTERNAL_SERVER_ERROR_STATUS
  ) {
    return exception.statusCode;
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

    const responseBody = {
      statusCode: httpStatus,
      timeStamp: new Date().toISOString(),
      message:
        httpStatus === INTERNAL_SERVER_ERROR_STATUS
          ? 'Internal server error'
          : message,
    };

    httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus);
  }
}

import { Catch, HttpException, ExceptionFilter, ArgumentsHost, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private configService: ConfigService) {}

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();

    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';

    this.logger.error(`Exception: ${exception.message}, status: ${status}`);

    response.status(status).json(
      isProduction
        ? {
            statusCode: status,
            timeStamp: new Date().toISOString(),
            message: exception.message,
          }
        : {
            statusCode: status,
            timeStamp: new Date().toISOString(),
            message: exception.message,
            stackTrace: exception.stack,
          },
    );
  }
}

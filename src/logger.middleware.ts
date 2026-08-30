import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger(LoggerMiddleware.name);

  use(request: Request, response: Response, next: NextFunction) {
    this.logger.log(`[${new Date().toISOString()}] ${request.method} ${request.url}`);
    next();
  }
}
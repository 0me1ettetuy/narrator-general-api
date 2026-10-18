import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker/worker.module.js';

const logger = new Logger('WorkerBootstrap');

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);

  app.enableShutdownHooks();
  logger.log('Worker process started');
}

void bootstrap().catch((error: unknown) => {
  const stack = error instanceof Error ? error.stack : undefined;

  logger.error('Worker process failed to start', stack);
  process.exitCode = 1;
});

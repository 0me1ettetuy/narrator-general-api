import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BOOK_PARSING_QUEUE, JOB_MAX_ATTEMPTS } from './jobs.constants.js';
import { JobsService } from './jobs.service.js';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: configService.getOrThrow<string>('REDIS_URL'),
        },
      }),
    }),
    BullModule.registerQueue({
      name: BOOK_PARSING_QUEUE,
      defaultJobOptions: {
        attempts: JOB_MAX_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: 5_000,
        },
        removeOnComplete: 1_000,
        removeOnFail: 1_000,
      },
    }),
  ],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}

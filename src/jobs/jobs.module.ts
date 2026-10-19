import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  AUDIO_MERGE_QUEUE,
  BOOK_PARSING_QUEUE,
  CHAPTER_TTS_QUEUE,
  JOB_MAX_ATTEMPTS,
} from './jobs.constants.js';
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
      defaultJobOptions: getDefaultJobOptions(),
    }),
    BullModule.registerQueue({
      name: CHAPTER_TTS_QUEUE,
      defaultJobOptions: getDefaultJobOptions(),
    }),
    BullModule.registerQueue({
      name: AUDIO_MERGE_QUEUE,
      defaultJobOptions: getDefaultJobOptions(),
    }),
  ],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}

function getDefaultJobOptions() {
  return {
    attempts: JOB_MAX_ATTEMPTS,
    backoff: {
      type: 'exponential' as const,
      delay: 5_000,
    },
    removeOnComplete: 1_000,
    removeOnFail: 1_000,
  };
}

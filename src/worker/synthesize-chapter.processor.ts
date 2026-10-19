import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  CHAPTER_TTS_QUEUE,
  SYNTHESIZE_CHAPTER_QUEUE_JOB,
} from '../jobs/jobs.constants.js';
import type { ChapterTtsJobData } from '../jobs/jobs.service.js';
import { ChapterTtsService } from '../tts/chapter-tts.service.js';

@Processor(CHAPTER_TTS_QUEUE, { concurrency: 1 })
export class SynthesizeChapterProcessor extends WorkerHost {
  private readonly logger = new Logger(SynthesizeChapterProcessor.name);

  constructor(private readonly chapterTtsService: ChapterTtsService) {
    super();
  }

  async process(job: Job<ChapterTtsJobData>): Promise<void> {
    if (job.name !== SYNTHESIZE_CHAPTER_QUEUE_JOB) {
      throw new Error(`Unsupported chapter TTS job: ${job.name}`);
    }

    try {
      const synthesizedJob = await this.chapterTtsService.synthesize(
        job.data.jobId,
      );

      if (synthesizedJob) {
        this.logger.log(
          `Synthesized chapter ${synthesizedJob.chapterId} for job ${synthesizedJob.id}`,
        );
      }
    } catch (error) {
      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

      await this.chapterTtsService.recordFailure(
        job.data.jobId,
        isFinalAttempt,
      );
      this.logger.error(
        `Chapter TTS failed for job ${job.data.jobId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }
}

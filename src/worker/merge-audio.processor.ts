import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  AUDIO_MERGE_QUEUE,
  MERGE_AUDIO_QUEUE_JOB,
} from '../jobs/jobs.constants.js';
import type { AudioMergeJobData } from '../jobs/jobs.service.js';
import { ChapterAudioMergeService } from '../tts/chapter-audio-merge.service.js';

@Processor(AUDIO_MERGE_QUEUE, { concurrency: 1 })
export class MergeAudioProcessor extends WorkerHost {
  private readonly logger = new Logger(MergeAudioProcessor.name);

  constructor(
    private readonly chapterAudioMergeService: ChapterAudioMergeService,
  ) {
    super();
  }

  async process(job: Job<AudioMergeJobData>): Promise<void> {
    if (job.name !== MERGE_AUDIO_QUEUE_JOB) {
      throw new Error(`Unsupported audio merge job: ${job.name}`);
    }

    try {
      const mergedJob = await this.chapterAudioMergeService.merge(
        job.data.jobId,
      );

      if (mergedJob) {
        this.logger.log(
          `Merged chapter ${mergedJob.chapterId} for job ${mergedJob.id}`,
        );
      }
    } catch (error) {
      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

      await this.chapterAudioMergeService.recordFailure(
        job.data.jobId,
        isFinalAttempt,
      );
      this.logger.error(
        `Audio merge failed for job ${job.data.jobId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }
}

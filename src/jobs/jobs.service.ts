import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  AUDIO_MERGE_QUEUE,
  BOOK_PARSING_QUEUE,
  CHAPTER_TTS_QUEUE,
  FISH_CHAPTER_TTS_QUEUE,
  MERGE_AUDIO_QUEUE_JOB,
  PARSE_BOOK_QUEUE_JOB,
  SYNTHESIZE_CHAPTER_QUEUE_JOB,
} from './jobs.constants.js';

export type BookParsingJobData = {
  jobId: string;
};

export type ChapterTtsJobData = {
  jobId: string;
};

export type AudioMergeJobData = {
  jobId: string;
};

export type ChapterTtsSource = 'LOCAL' | 'FISH';

@Injectable()
export class JobsService {
  constructor(
    @InjectQueue(BOOK_PARSING_QUEUE)
    private readonly bookParsingQueue: Queue<BookParsingJobData>,
    @InjectQueue(CHAPTER_TTS_QUEUE)
    private readonly localChapterTtsQueue: Queue<ChapterTtsJobData>,
    @InjectQueue(FISH_CHAPTER_TTS_QUEUE)
    private readonly fishChapterTtsQueue: Queue<ChapterTtsJobData>,
    @InjectQueue(AUDIO_MERGE_QUEUE)
    private readonly audioMergeQueue: Queue<AudioMergeJobData>,
  ) {}

  async enqueueBookParsing(jobId: string): Promise<void> {
    await this.bookParsingQueue.add(PARSE_BOOK_QUEUE_JOB, { jobId }, { jobId });
  }

  // Separate queues so remote Fish and CPU-bound local TTS get own concurrency.
  async enqueueChapterSynthesis(
    jobId: string,
    source: ChapterTtsSource,
  ): Promise<void> {
    const target =
      source === 'FISH' ? this.fishChapterTtsQueue : this.localChapterTtsQueue;
    const other =
      source === 'FISH' ? this.localChapterTtsQueue : this.fishChapterTtsQueue;
    const existingElsewhere = await other.getJob(jobId);

    if (existingElsewhere) {
      if ((await existingElsewhere.getState()) === 'active') {
        return;
      }

      await existingElsewhere.remove();
    }

    await this.enqueueReplacingInactiveJob(
      target,
      SYNTHESIZE_CHAPTER_QUEUE_JOB,
      { jobId },
      jobId,
    );
  }

  async enqueueAudioMerge(jobId: string): Promise<void> {
    await this.enqueueReplacingInactiveJob(
      this.audioMergeQueue,
      MERGE_AUDIO_QUEUE_JOB,
      { jobId },
      jobId,
    );
  }

  async cancelChapterSynthesis(jobId: string): Promise<void> {
    await this.removeWaitingJob(this.localChapterTtsQueue, jobId);
    await this.removeWaitingJob(this.fishChapterTtsQueue, jobId);
  }

  async cancelAudioMerge(jobId: string): Promise<void> {
    await this.removeWaitingJob(this.audioMergeQueue, jobId);
  }

  async removeBookParsing(jobId: string): Promise<void> {
    await this.removeInactiveJob(this.bookParsingQueue, jobId);
  }

  async removeChapterSynthesis(jobId: string): Promise<void> {
    await this.removeInactiveJob(this.localChapterTtsQueue, jobId);
    await this.removeInactiveJob(this.fishChapterTtsQueue, jobId);
  }

  async removeAudioMerge(jobId: string): Promise<void> {
    await this.removeInactiveJob(this.audioMergeQueue, jobId);
  }

  private async removeWaitingJob<T>(queue: Queue<T>, jobId: string) {
    const job = await queue.getJob(jobId);

    if (!job) {
      return;
    }

    const state = await job.getState();

    if (
      state === 'waiting' ||
      state === 'delayed' ||
      state === 'prioritized' ||
      state === 'waiting-children'
    ) {
      await job.remove();
    }
  }

  private async enqueueReplacingInactiveJob<T>(
    queue: Queue<T>,
    name: Parameters<Queue<T>['add']>[0],
    data: Parameters<Queue<T>['add']>[1],
    jobId: string,
  ): Promise<void> {
    const existingJob = await queue.getJob(jobId);

    if (existingJob) {
      const state = await existingJob.getState();

      if (state === 'active') {
        return;
      }

      await existingJob.remove();
    }

    await queue.add(name, data, { jobId });
  }

  private async removeInactiveJob<T>(
    queue: Queue<T>,
    jobId: string,
  ): Promise<void> {
    const job = await queue.getJob(jobId);

    if (!job || (await job.getState()) === 'active') {
      return;
    }

    await job.remove();
  }
}

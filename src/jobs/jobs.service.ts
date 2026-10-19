import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  AUDIO_MERGE_QUEUE,
  BOOK_PARSING_QUEUE,
  CHAPTER_TTS_QUEUE,
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

@Injectable()
export class JobsService {
  constructor(
    @InjectQueue(BOOK_PARSING_QUEUE)
    private readonly bookParsingQueue: Queue<BookParsingJobData>,
    @InjectQueue(CHAPTER_TTS_QUEUE)
    private readonly chapterTtsQueue: Queue<ChapterTtsJobData>,
    @InjectQueue(AUDIO_MERGE_QUEUE)
    private readonly audioMergeQueue: Queue<AudioMergeJobData>,
  ) {}

  async enqueueBookParsing(jobId: string): Promise<void> {
    await this.bookParsingQueue.add(PARSE_BOOK_QUEUE_JOB, { jobId }, { jobId });
  }

  async enqueueChapterSynthesis(jobId: string): Promise<void> {
    await this.chapterTtsQueue.add(
      SYNTHESIZE_CHAPTER_QUEUE_JOB,
      { jobId },
      { jobId },
    );
  }

  async enqueueAudioMerge(jobId: string): Promise<void> {
    await this.audioMergeQueue.add(MERGE_AUDIO_QUEUE_JOB, { jobId }, { jobId });
  }
}

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { BOOK_PARSING_QUEUE, PARSE_BOOK_QUEUE_JOB } from './jobs.constants.js';

export type BookParsingJobData = {
  jobId: string;
};

@Injectable()
export class JobsService {
  constructor(
    @InjectQueue(BOOK_PARSING_QUEUE)
    private readonly bookParsingQueue: Queue<BookParsingJobData>,
  ) {}

  async enqueueBookParsing(jobId: string): Promise<void> {
    await this.bookParsingQueue.add(PARSE_BOOK_QUEUE_JOB, { jobId }, { jobId });
  }
}

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { BookParsingService } from '../books/book-parsing.service.js';
import {
  BOOK_PARSING_QUEUE,
  PARSE_BOOK_QUEUE_JOB,
} from '../jobs/jobs.constants.js';
import type { BookParsingJobData } from '../jobs/jobs.service.js';

@Processor(BOOK_PARSING_QUEUE, { concurrency: 1 })
export class ParseBookProcessor extends WorkerHost {
  private readonly logger = new Logger(ParseBookProcessor.name);

  constructor(private readonly bookParsingService: BookParsingService) {
    super();
  }

  async process(job: Job<BookParsingJobData>): Promise<void> {
    if (job.name !== PARSE_BOOK_QUEUE_JOB) {
      throw new Error(`Unsupported book parsing job: ${job.name}`);
    }

    try {
      const parsedJob = await this.bookParsingService.parse(job.data.jobId);

      if (parsedJob) {
        this.logger.log(
          `Parsed book ${parsedJob.bookId} for job ${parsedJob.id}`,
        );
      }
    } catch (error) {
      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

      await this.bookParsingService.recordFailure(
        job.data.jobId,
        isFinalAttempt,
      );
      this.logger.error(
        `Book parsing failed for job ${job.data.jobId}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }
}

import type { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import type { BookParsingService } from '../books/book-parsing.service.js';
import { PARSE_BOOK_QUEUE_JOB } from '../jobs/jobs.constants.js';

jest.mock('../books/book-parsing.service.js', () => ({
  BookParsingService: class BookParsingService {},
}));

import { ParseBookProcessor } from './parse-book.processor.js';

describe('ParseBookProcessor', () => {
  const bookParsingService = {
    parse: jest.fn(),
    recordFailure: jest.fn(),
  };
  const processor = new ParseBookProcessor(
    bookParsingService as unknown as BookParsingService,
  );

  beforeEach(() => {
    bookParsingService.parse.mockReset();
    bookParsingService.recordFailure.mockReset();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('processes a queued parse job', async () => {
    bookParsingService.parse.mockResolvedValue({
      id: 'job-id',
      bookId: 'book-id',
      maxAttempts: 3,
    });

    await processor.process(createQueueJob());

    expect(bookParsingService.parse).toHaveBeenCalledWith('job-id');
    expect(bookParsingService.recordFailure).not.toHaveBeenCalled();
  });

  it('keeps the book queued when a retry remains', async () => {
    const error = new Error('R2 unavailable');
    bookParsingService.parse.mockRejectedValue(error);

    await expect(
      processor.process(createQueueJob({ attemptsMade: 0 })),
    ).rejects.toThrow(error);

    expect(bookParsingService.recordFailure).toHaveBeenCalledWith(
      'job-id',
      false,
    );
  });

  it('marks the job as final on its last allowed attempt', async () => {
    bookParsingService.parse.mockRejectedValue(new Error('Invalid EPUB'));

    await expect(
      processor.process(createQueueJob({ attemptsMade: 2 })),
    ).rejects.toThrow('Invalid EPUB');

    expect(bookParsingService.recordFailure).toHaveBeenCalledWith(
      'job-id',
      true,
    );
  });
});

function createQueueJob(
  overrides: Partial<Pick<Job, 'attemptsMade'>> = {},
): Job<{ jobId: string }> {
  return {
    name: PARSE_BOOK_QUEUE_JOB,
    data: { jobId: 'job-id' },
    attemptsMade: 0,
    opts: { attempts: 3 },
    ...overrides,
  } as Job<{ jobId: string }>;
}

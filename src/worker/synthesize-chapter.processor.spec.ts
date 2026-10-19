import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { SYNTHESIZE_CHAPTER_QUEUE_JOB } from '../jobs/jobs.constants.js';
import type { ChapterTtsService } from '../tts/chapter-tts.service.js';

jest.mock('../tts/chapter-tts.service.js', () => ({
  ChapterTtsService: class ChapterTtsService {},
}));

import { SynthesizeChapterProcessor } from './synthesize-chapter.processor.js';

describe('SynthesizeChapterProcessor', () => {
  const chapterTtsService = {
    synthesize: jest.fn(),
    recordFailure: jest.fn(),
  };
  const processor = new SynthesizeChapterProcessor(
    chapterTtsService as unknown as ChapterTtsService,
  );

  beforeEach(() => {
    chapterTtsService.synthesize.mockReset();
    chapterTtsService.recordFailure.mockReset();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('processes a queued chapter synthesis job', async () => {
    chapterTtsService.synthesize.mockResolvedValue({
      id: 'job-id',
      chapterId: 'chapter-id',
    });

    await processor.process(createQueueJob());

    expect(chapterTtsService.synthesize).toHaveBeenCalledWith('job-id');
    expect(chapterTtsService.recordFailure).not.toHaveBeenCalled();
  });

  it('keeps the audio queued when a retry remains', async () => {
    const error = new Error('OpenRouter unavailable');
    chapterTtsService.synthesize.mockRejectedValue(error);

    await expect(
      processor.process(createQueueJob({ attemptsMade: 0 })),
    ).rejects.toThrow(error);

    expect(chapterTtsService.recordFailure).toHaveBeenCalledWith(
      'job-id',
      false,
    );
  });

  it('marks the audio as final on its last allowed attempt', async () => {
    chapterTtsService.synthesize.mockRejectedValue(new Error('TTS rejected'));

    await expect(
      processor.process(createQueueJob({ attemptsMade: 2 })),
    ).rejects.toThrow('TTS rejected');

    expect(chapterTtsService.recordFailure).toHaveBeenCalledWith(
      'job-id',
      true,
    );
  });
});

function createQueueJob(
  overrides: Partial<Pick<Job, 'attemptsMade'>> = {},
): Job<{ jobId: string }> {
  return {
    name: SYNTHESIZE_CHAPTER_QUEUE_JOB,
    data: { jobId: 'job-id' },
    attemptsMade: 0,
    opts: { attempts: 3 },
    ...overrides,
  } as Job<{ jobId: string }>;
}

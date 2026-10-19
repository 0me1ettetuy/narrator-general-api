import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MERGE_AUDIO_QUEUE_JOB } from '../jobs/jobs.constants.js';
import type { ChapterAudioMergeService } from '../tts/chapter-audio-merge.service.js';

jest.mock('../tts/chapter-audio-merge.service.js', () => ({
  ChapterAudioMergeService: class ChapterAudioMergeService {},
}));

import { MergeAudioProcessor } from './merge-audio.processor.js';

describe('MergeAudioProcessor', () => {
  const chapterAudioMergeService = {
    merge: jest.fn(),
    recordFailure: jest.fn(),
  };
  const processor = new MergeAudioProcessor(
    chapterAudioMergeService as unknown as ChapterAudioMergeService,
  );

  beforeEach(() => {
    chapterAudioMergeService.merge.mockReset();
    chapterAudioMergeService.recordFailure.mockReset();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('processes a queued merge job', async () => {
    chapterAudioMergeService.merge.mockResolvedValue({
      id: 'job-id',
      chapterId: 'chapter-id',
    });

    await processor.process(createQueueJob());

    expect(chapterAudioMergeService.merge).toHaveBeenCalledWith('job-id');
    expect(chapterAudioMergeService.recordFailure).not.toHaveBeenCalled();
  });

  it('keeps the audio queued when a retry remains', async () => {
    const error = new Error('FFmpeg failed');
    chapterAudioMergeService.merge.mockRejectedValue(error);

    await expect(
      processor.process(createQueueJob({ attemptsMade: 0 })),
    ).rejects.toThrow(error);

    expect(chapterAudioMergeService.recordFailure).toHaveBeenCalledWith(
      'job-id',
      false,
    );
  });

  it('marks the merge as final on its last allowed attempt', async () => {
    chapterAudioMergeService.merge.mockRejectedValue(new Error('R2 failed'));

    await expect(
      processor.process(createQueueJob({ attemptsMade: 2 })),
    ).rejects.toThrow('R2 failed');

    expect(chapterAudioMergeService.recordFailure).toHaveBeenCalledWith(
      'job-id',
      true,
    );
  });
});

function createQueueJob(
  overrides: Partial<Pick<Job, 'attemptsMade'>> = {},
): Job<{ jobId: string }> {
  return {
    name: MERGE_AUDIO_QUEUE_JOB,
    data: { jobId: 'job-id' },
    attemptsMade: 0,
    opts: { attempts: 3 },
    ...overrides,
  } as Job<{ jobId: string }>;
}

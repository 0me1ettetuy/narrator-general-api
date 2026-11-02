import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import type { AudioMergeService } from './audio-merge.service.js';

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../storage/storage.service.js', () => ({
  StorageService: class StorageService {},
}));
jest.mock('./audio-merge.service.js', () => ({
  AudioMergeService: class AudioMergeService {},
}));

import { ChapterAudioMergeService } from './chapter-audio-merge.service.js';

describe('ChapterAudioMergeService', () => {
  it('declines a job whose book is being deleted', async () => {
    const jobUpdate = jest.fn();
    const row = (value: unknown, update?: jest.Mock) => () => ({
      first: jest.fn().mockResolvedValue(value),
      update,
    });
    const db = {
      transaction: jest.fn((callback: (database: unknown) => unknown) =>
        callback(db),
      ),
      orm: {
        public: {
          Job: {
            where: jest.fn(
              row(
                {
                  id: 'merge-job-id',
                  bookId: 'book-id',
                  chapterId: 'chapter-id',
                  status: 'QUEUED',
                  attempts: 0,
                  maxAttempts: 3,
                },
                jobUpdate,
              ),
            ),
          },
          Book: {
            where: jest.fn(
              row({ id: 'book-id', userId: 'user-id', deletedAt: 'now' }),
            ),
          },
          Audio: {
            where: jest.fn(row({ id: 'audio-id', status: 'PROCESSING' })),
          },
        },
      },
    };
    const audioMergeService = { merge: jest.fn() };
    const service = new ChapterAudioMergeService(
      { db } as unknown as PrismaService,
      audioMergeService as unknown as AudioMergeService,
      {} as StorageService,
    );

    await expect(service.merge('merge-job-id')).resolves.toBeNull();

    expect(jobUpdate).not.toHaveBeenCalled();
    expect(audioMergeService.merge).not.toHaveBeenCalled();
  });
});

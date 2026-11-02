import type { JobsService } from '../jobs/jobs.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import type { FishVoiceService } from '../tts-models/fish-voice.service.js';
import type { AudioChunkService } from './audio-chunk.service.js';
import type { TtsAdapterResolverService } from './tts-adapter-resolver.service.js';

jest.mock('../jobs/jobs.service.js', () => ({
  JobsService: class JobsService {},
}));
jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../storage/storage.service.js', () => ({
  StorageService: class StorageService {},
}));
jest.mock('../tts-models/fish-voice.service.js', () => ({
  FishVoiceService: class FishVoiceService {},
}));
jest.mock('./audio-chunk.service.js', () => ({
  AudioChunkService: class AudioChunkService {},
}));
jest.mock('./tts-adapter-resolver.service.js', () => ({
  TtsAdapterResolverService: class TtsAdapterResolverService {},
}));

import { ChapterTtsService } from './chapter-tts.service.js';

describe('ChapterTtsService', () => {
  it('declines a job whose book is being deleted', async () => {
    const jobUpdate = jest.fn();
    const audioUpdate = jest.fn();
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
                  id: 'job-id',
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
          Chapter: {
            where: jest.fn(row({ id: 'chapter-id', bookId: 'book-id' })),
          },
          Book: {
            where: jest.fn(
              row({
                id: 'book-id',
                userId: 'user-id',
                language: 'en',
                deletedAt: 'now',
              }),
            ),
          },
          Audio: {
            where: jest.fn(
              row({ id: 'audio-id', status: 'QUEUED' }, audioUpdate),
            ),
          },
        },
      },
    };
    const audioChunkService = { ensurePlan: jest.fn() };
    const service = new ChapterTtsService(
      { db } as unknown as PrismaService,
      {} as StorageService,
      audioChunkService as unknown as AudioChunkService,
      {} as TtsAdapterResolverService,
      {} as FishVoiceService,
      {} as JobsService,
    );

    await expect(service.synthesize('job-id')).resolves.toBeNull();

    expect(jobUpdate).not.toHaveBeenCalled();
    expect(audioUpdate).not.toHaveBeenCalled();
    expect(audioChunkService.ensurePlan).not.toHaveBeenCalled();
  });
});

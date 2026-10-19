import type { PrismaService } from '../prisma/prisma.service.js';

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

import { AudioChunkService } from './audio-chunk.service.js';

describe('AudioChunkService', () => {
  const audio = { id: 'audio-id', chapterId: 'chapter-id' };
  const chapter = {
    id: 'chapter-id',
    text: 'First paragraph.\n\nSecond paragraph.',
  };
  const audioFirst = jest.fn();
  const chunkAll = jest.fn();
  const chapterFirst = jest.fn();
  const audioUpdate = jest.fn();
  const chunkCreate = jest.fn();
  const transaction = {
    orm: {
      public: {
        Audio: {
          where: jest.fn(() => ({ first: audioFirst, update: audioUpdate })),
        },
        AudioChunk: {
          where: jest.fn(() => ({ all: chunkAll })),
          create: chunkCreate,
        },
        Chapter: {
          where: jest.fn(() => ({ first: chapterFirst })),
        },
      },
    },
  };
  const prisma = {
    db: {
      transaction: jest.fn((callback: (value: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    },
  };

  let service: AudioChunkService;

  beforeEach(() => {
    jest.clearAllMocks();
    audioFirst.mockResolvedValue(audio);
    chunkAll.mockResolvedValue([]);
    chapterFirst.mockResolvedValue(chapter);
    chunkCreate.mockResolvedValue(undefined);
    audioUpdate.mockResolvedValue(undefined);
    service = new AudioChunkService(prisma as unknown as PrismaService);
  });

  it('creates an ordered frozen chunk plan and stores its aggregate counts', async () => {
    await expect(service.ensurePlan(audio.id)).resolves.toEqual({
      audioId: audio.id,
      totalChunks: 1,
      completedChunks: 0,
    });

    expect(chunkCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        audioId: audio.id,
        position: 0,
        text: chapter.text,
        textChecksum: expect.stringMatching(/^[a-f0-9]{64}$/u),
      }),
    );
    expect(audioUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ totalChunks: 1, completedChunks: 0 }),
    );
  });

  it('reuses persisted chunks and recalculates ready progress without duplicating them', async () => {
    chunkAll.mockResolvedValue([
      { status: 'READY' },
      { status: 'PROCESSING' },
      { status: 'QUEUED' },
    ]);

    await expect(service.ensurePlan(audio.id)).resolves.toEqual({
      audioId: audio.id,
      totalChunks: 3,
      completedChunks: 1,
    });

    expect(chunkCreate).not.toHaveBeenCalled();
    expect(chapterFirst).not.toHaveBeenCalled();
    expect(audioUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ totalChunks: 3, completedChunks: 1 }),
    );
  });

  it('rejects an unknown audio asset', async () => {
    audioFirst.mockResolvedValue(null);

    await expect(service.ensurePlan(audio.id)).rejects.toThrow(
      'Audio asset not found',
    );
  });
});

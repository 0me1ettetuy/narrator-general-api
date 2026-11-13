import type { PrismaService } from '../prisma/prisma.service.js';
import { findBookIdsWithReadyAudio } from './book-ready-audio.js';

describe('findBookIdsWithReadyAudio', () => {
  const makePrisma = (chapters: object[], audio: object[]) => {
    const chapterWhere = jest.fn(() => ({
      select: () => ({ all: async () => chapters }),
    }));
    const audioWhere = jest.fn(() => ({
      select: () => ({ all: async () => audio }),
    }));

    return {
      chapterWhere,
      audioWhere,
      prisma: {
        db: {
          orm: {
            public: {
              Chapter: { where: chapterWhere },
              Audio: { where: audioWhere },
            },
          },
        },
      } as unknown as PrismaService,
    };
  };

  it('returns only books with a ready audio on a live chapter', async () => {
    const { prisma } = makePrisma(
      [
        { id: 'c1', bookId: 'ready-book', removedAt: null },
        { id: 'c2', bookId: 'queued-book', removedAt: null },
        { id: 'c3', bookId: 'removed-book', removedAt: new Date() },
        { id: 'c4', bookId: 'no-audio-book', removedAt: null },
      ],
      [
        { chapterId: 'c1', status: 'READY' },
        { chapterId: 'c2', status: 'QUEUED' },
        { chapterId: 'c3', status: 'READY' },
      ],
    );

    await expect(
      findBookIdsWithReadyAudio(prisma, [
        'ready-book',
        'queued-book',
        'removed-book',
        'no-audio-book',
      ]),
    ).resolves.toEqual(new Set(['ready-book']));
  });

  it('does not query anything for no books', async () => {
    const { prisma, chapterWhere } = makePrisma([], []);

    await expect(findBookIdsWithReadyAudio(prisma, [])).resolves.toEqual(
      new Set(),
    );
    expect(chapterWhere).not.toHaveBeenCalled();
  });
});

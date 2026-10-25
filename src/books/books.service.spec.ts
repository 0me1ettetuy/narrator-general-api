import type { JobsService } from '../jobs/jobs.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import type { TtsModelsService } from '../tts-models/tts-models.service.js';
import type { Audio, Book, Chapter, ProcessingJob } from './types/book.type.js';

jest.mock('../jobs/jobs.service.js', () => ({
  JobsService: class JobsService {},
}));

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../storage/storage.service.js', () => ({
  StorageService: class StorageService {},
}));

jest.mock('../tts-models/tts-models.service.js', () => ({
  TtsModelsService: class TtsModelsService {},
}));

import { BooksService } from './books.service.js';

type ChapterAudioQueue = {
  audio: Audio;
  job: ProcessingJob;
  shouldEnqueue: boolean;
};

type BooksServiceInternals = {
  createOrReuseChapterAudioJob: (
    bookId: string,
    chapterId: string,
    modelId: string | null,
  ) => Promise<ChapterAudioQueue>;
};

describe('BooksService', () => {
  const book = { id: 'book-id', userId: 'user-id' } as Book;
  const firstChapter = {
    id: 'first-chapter-id',
    bookId: book.id,
    position: 1,
  } as Chapter;
  const secondChapter = {
    id: 'second-chapter-id',
    bookId: book.id,
    position: 2,
  } as Chapter;
  const bookFirst = jest.fn();
  const chaptersAll = jest.fn();
  const audioFirst = jest.fn();
  const db = {
    orm: {
      public: {
        Audio: { where: jest.fn() },
        Book: { where: jest.fn() },
        Chapter: { where: jest.fn() },
      },
    },
  };
  const prisma = {
    db,
  } as unknown as PrismaService;
  const jobsService = {
    enqueueChapterSynthesis: jest.fn().mockResolvedValue(undefined),
  } as unknown as JobsService;
  const ttsModelsService = {
    getSelectableModel: jest.fn(),
  } as unknown as TtsModelsService;

  beforeEach(() => {
    jest.clearAllMocks();
    bookFirst.mockResolvedValue(book);
    chaptersAll.mockResolvedValue([secondChapter, firstChapter]);
    audioFirst.mockResolvedValue(null);
    db.orm.public.Book.where.mockReturnValue({ first: bookFirst });
    db.orm.public.Chapter.where.mockReturnValue({ all: chaptersAll });
    db.orm.public.Audio.where.mockReturnValue({ first: audioFirst });
    jest.mocked(ttsModelsService.getSelectableModel).mockResolvedValue({
      id: 'local.piper.en-us-amy',
      source: 'LOCAL',
      providerModel: null,
    });
  });

  it('queues selected chapters in book order through the saved user model', async () => {
    const service = new BooksService(
      prisma,
      {} as StorageService,
      jobsService,
      ttsModelsService,
    );
    const createAudioJob = jest
      .spyOn(
        service as unknown as BooksServiceInternals,
        'createOrReuseChapterAudioJob',
      )
      .mockResolvedValueOnce({
        audio: {} as Audio,
        job: { id: 'first-job-id' } as ProcessingJob,
        shouldEnqueue: true,
      })
      .mockResolvedValueOnce({
        audio: {} as Audio,
        job: { id: 'second-job-id' } as ProcessingJob,
        shouldEnqueue: false,
      });

    await expect(
      service.queueSelectedChapterAudio('user-id', book.id, [
        secondChapter.id,
        firstChapter.id,
      ]),
    ).resolves.toEqual({
      affectedChapterIds: [firstChapter.id],
      skippedChapterIds: [secondChapter.id],
    });

    expect(ttsModelsService.getSelectableModel).toHaveBeenCalledWith(
      'user-id',
      null,
    );
    expect(createAudioJob).toHaveBeenNthCalledWith(
      1,
      book.id,
      firstChapter.id,
      'local.piper.en-us-amy',
    );
    expect(createAudioJob).toHaveBeenNthCalledWith(
      2,
      book.id,
      secondChapter.id,
      'local.piper.en-us-amy',
    );
    expect(jobsService.enqueueChapterSynthesis).toHaveBeenCalledWith(
      'first-job-id',
    );
  });
});

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { JOB_MAX_ATTEMPTS } from '../jobs/jobs.constants.js';
import { JobsService } from '../jobs/jobs.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { temporalNow } from '../prisma/temporal.js';
import { StorageService } from '../storage/storage.service.js';
import { FishVoiceService } from '../tts-models/fish-voice.service.js';
import { AudioChunkService } from './audio-chunk.service.js';
import { TtsAdapterResolverService } from './tts-adapter-resolver.service.js';

const CHAPTER_TTS_FAILED_ERROR = 'CHAPTER_TTS_FAILED';
const MERGE_JOB_IDEMPOTENCY_KEY_PREFIX = 'merge-audio';

type PersistedJob = {
  id: string;
  bookId: string;
  chapterId: string | null;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  attempts: number;
  maxAttempts: number;
};

type PersistedBook = {
  id: string;
  userId: string;
};

type PersistedChapter = {
  id: string;
  bookId: string;
};

type PersistedAudio = {
  id: string;
  chapterId: string;
  modelKey: string | null;
  voice: string | null;
  status:
    'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED' | 'CANCELLED' | 'DELETING';
};

type PersistedAudioChunk = {
  id: string;
  position: number;
  status: 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';
  objectKey: string | null;
  text: string;
};

export type ClaimedChapterTtsJob = {
  id: string;
  bookId: string;
  chapterId: string;
  audioId: string;
  userId: string;
  modelKey: string | null;
  voice: string | null;
  maxAttempts: number;
};

@Injectable()
export class ChapterTtsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly audioChunkService: AudioChunkService,
    private readonly ttsAdapterResolver: TtsAdapterResolverService,
    private readonly fishVoices: FishVoiceService,
    private readonly jobsService: JobsService,
  ) {}

  async synthesize(jobId: string): Promise<ClaimedChapterTtsJob | null> {
    const claimedJob = await this.claim(jobId);

    if (!claimedJob) {
      return null;
    }

    const plan = await this.audioChunkService.ensurePlan(claimedJob.audioId);

    if (!(await this.isActive(claimedJob))) {
      return claimedJob;
    }

    await this.prepareGeneration(claimedJob, plan.totalChunks);
    await this.requeueUnfinishedChunks(claimedJob.audioId);

    const chunks = await this.getChunks(claimedJob.audioId);
    const resolvedTtsAdapter = await this.ttsAdapterResolver.resolve(
      claimedJob.userId,
      claimedJob.modelKey,
    );
    const voiceId = await this.getVoiceSnapshot(
      claimedJob,
      resolvedTtsAdapter.source,
    );
    let completedChunks = 0;

    for (const chunk of chunks) {
      if (!(await this.isActive(claimedJob))) {
        return claimedJob;
      }

      if (await this.hasStoredPart(chunk)) {
        completedChunks += 1;
        await this.updateGenerationProgress(
          claimedJob,
          plan.totalChunks,
          completedChunks,
        );
        continue;
      }

      await this.markChunkProcessing(chunk.id);

      const result = await resolvedTtsAdapter.adapter.synthesizeStream({
        text: chunk.text,
        userId: claimedJob.userId,
        providerModel: resolvedTtsAdapter.providerModel,
        voiceId,
      });

      // A provider request already in flight cannot be recalled. Do not
      // persist its response when the user cancelled while it was running.
      if (!(await this.isActive(claimedJob))) {
        result.abort();
        return claimedJob;
      }

      const objectKey = getTemporaryPartObjectKey(
        claimedJob.userId,
        claimedJob.bookId,
        claimedJob.audioId,
        chunk.position,
      );

      try {
        await this.storageService.putObjectStream(
          objectKey,
          result.stream,
          result.mimeType,
        );
      } catch (error) {
        result.abort();
        await this.storageService
          .deleteObject(objectKey)
          .catch(() => undefined);
        throw error;
      }

      if (!(await this.isActive(claimedJob))) {
        await this.storageService
          .deleteObject(objectKey)
          .catch(() => undefined);

        return claimedJob;
      }

      completedChunks += 1;
      await this.persistReadyChunk({
        chunkId: chunk.id,
        audioId: claimedJob.audioId,
        jobId: claimedJob.id,
        totalChunks: plan.totalChunks,
        completedChunks,
        objectKey,
        mimeType: result.mimeType,
        byteSize: result.getByteSize(),
        provider: result.provider,
        voice: result.voice,
        providerGenerationId: result.generationId,
      });
    }

    const mergeJobId = await this.prepareMerge(claimedJob, plan.totalChunks);

    if (!mergeJobId) {
      return claimedJob;
    }

    // The database row exists before we ask Redis to enqueue it. If Redis is
    // temporarily unavailable, this synthesis job is retried and safely tries
    // the same deterministic merge job ID again.
    await this.jobsService.enqueueAudioMerge(mergeJobId);
    await this.markSynthesisCompleted(claimedJob.id);

    return claimedJob;
  }

  async recordFailure(jobId: string, isFinalAttempt: boolean): Promise<void> {
    const now = temporalNow();

    await this.prisma.db.transaction(async (transaction) => {
      const job = (await transaction.orm.public.Job.where({
        id: jobId,
        type: 'SYNTHESIZE_CHAPTER',
        status: 'PROCESSING',
      }).first()) as PersistedJob | null;

      if (!job) {
        return;
      }

      const audio = job.chapterId
        ? ((await transaction.orm.public.Audio.where({
            chapterId: job.chapterId,
          }).first()) as PersistedAudio | null)
        : null;
      const status = isFinalAttempt ? 'FAILED' : 'QUEUED';

      await transaction.orm.public.Job.where({
        id: job.id,
        status: 'PROCESSING',
      }).update({
        status,
        progress: 0,
        error: CHAPTER_TTS_FAILED_ERROR,
        completedAt: isFinalAttempt ? now : null,
        updatedAt: now,
      });

      if (!audio) {
        return;
      }

      await transaction.orm.public.Audio.where({
        id: audio.id,
        status: 'PROCESSING',
      }).update({
        status,
        processingStage: null,
        error: isFinalAttempt ? CHAPTER_TTS_FAILED_ERROR : null,
        updatedAt: now,
      });
      await transaction.orm.public.AudioChunk.where({
        audioId: audio.id,
        status: 'PROCESSING',
      }).update({
        status: isFinalAttempt ? 'FAILED' : 'QUEUED',
        error: isFinalAttempt ? CHAPTER_TTS_FAILED_ERROR : null,
        updatedAt: now,
      });
    });
  }

  private async claim(jobId: string): Promise<ClaimedChapterTtsJob | null> {
    const now = temporalNow();

    return this.prisma.db.transaction(async (transaction) => {
      const job = (await transaction.orm.public.Job.where({
        id: jobId,
        type: 'SYNTHESIZE_CHAPTER',
      }).first()) as PersistedJob | null;

      // PROCESSING is accepted here to recover an active BullMQ job after a
      // worker process is killed before it can record its retry state.
      if (
        !job ||
        !job.chapterId ||
        (job.status !== 'QUEUED' && job.status !== 'PROCESSING')
      ) {
        return null;
      }

      const chapter = (await transaction.orm.public.Chapter.where({
        id: job.chapterId,
        bookId: job.bookId,
      }).first()) as PersistedChapter | null;
      const book = (await transaction.orm.public.Book.where({
        id: job.bookId,
      }).first()) as PersistedBook | null;
      const audio = (await transaction.orm.public.Audio.where({
        chapterId: job.chapterId,
      }).first()) as PersistedAudio | null;

      if (!chapter || !book) {
        throw new Error('Chapter TTS job references missing data');
      }

      if (
        !audio ||
        (audio.status !== 'QUEUED' && audio.status !== 'PROCESSING')
      ) {
        return null;
      }

      await transaction.orm.public.Job.where({ id: job.id }).update({
        status: 'PROCESSING',
        attempts: job.attempts + 1,
        progress: 0,
        error: null,
        startedAt: now,
        completedAt: null,
        updatedAt: now,
      });
      await transaction.orm.public.Audio.where({ id: audio.id }).update({
        status: 'PROCESSING',
        processingStage: 'CHUNKING',
        error: null,
        completedAt: null,
        updatedAt: now,
      });

      return {
        id: job.id,
        bookId: book.id,
        chapterId: chapter.id,
        audioId: audio.id,
        userId: book.userId,
        modelKey: audio.modelKey,
        voice: audio.voice,
        maxAttempts: job.maxAttempts,
      };
    });
  }

  private async prepareGeneration(
    job: ClaimedChapterTtsJob,
    totalChunks: number,
  ): Promise<void> {
    const now = temporalNow();

    await this.prisma.db.transaction(async (transaction) => {
      await transaction.orm.public.Audio.where({
        id: job.audioId,
        status: 'PROCESSING',
      }).update({
        processingStage: 'GENERATING',
        totalChunks,
        completedChunks: 0,
        error: null,
        updatedAt: now,
      });
      await transaction.orm.public.Job.where({
        id: job.id,
        status: 'PROCESSING',
      }).update({
        progress: 5,
        updatedAt: now,
      });
    });
  }

  private async requeueUnfinishedChunks(audioId: string): Promise<void> {
    const now = temporalNow();

    for (const status of ['PROCESSING', 'FAILED'] as const) {
      await this.prisma.db.orm.public.AudioChunk.where({
        audioId,
        status,
      }).update({
        status: 'QUEUED',
        error: null,
        updatedAt: now,
      });
    }
  }

  private async getChunks(audioId: string): Promise<PersistedAudioChunk[]> {
    const chunks = (await this.prisma.db.orm.public.AudioChunk.where({
      audioId,
    }).all()) as PersistedAudioChunk[];

    return chunks.sort(
      (first, second) =>
        first.position - second.position || first.id.localeCompare(second.id),
    );
  }

  private async getVoiceSnapshot(
    job: ClaimedChapterTtsJob,
    source: 'LOCAL' | 'FISH',
  ): Promise<string | null> {
    if (source !== 'FISH' || job.voice) {
      return job.voice;
    }

    const voiceId = await this.fishVoices.resolveVoiceReferenceId(job.userId);

    if (!voiceId) {
      return null;
    }

    await this.prisma.db.orm.public.Audio.where({
      id: job.audioId,
      status: 'PROCESSING',
    }).update({
      voice: voiceId,
      updatedAt: temporalNow(),
    });

    return voiceId;
  }

  private async hasStoredPart(chunk: PersistedAudioChunk): Promise<boolean> {
    if (chunk.status !== 'READY' || !chunk.objectKey) {
      return false;
    }

    const object = await this.storageService.getObjectMetadata(chunk.objectKey);

    if (object) {
      return true;
    }

    await this.prisma.db.orm.public.AudioChunk.where({ id: chunk.id }).update({
      status: 'QUEUED',
      objectKey: null,
      mimeType: null,
      byteSize: null,
      providerGenerationId: null,
      error: null,
      completedAt: null,
      updatedAt: temporalNow(),
    });

    return false;
  }

  private async markChunkProcessing(chunkId: string): Promise<void> {
    await this.prisma.db.orm.public.AudioChunk.where({ id: chunkId }).update({
      status: 'PROCESSING',
      error: null,
      updatedAt: temporalNow(),
    });
  }

  private async persistReadyChunk(input: {
    chunkId: string;
    audioId: string;
    jobId: string;
    totalChunks: number;
    completedChunks: number;
    objectKey: string;
    mimeType: string;
    byteSize: number;
    provider: string;
    voice: string;
    providerGenerationId: string | null;
  }): Promise<void> {
    const now = temporalNow();

    await this.prisma.db.transaction(async (transaction) => {
      await transaction.orm.public.AudioChunk.where({
        id: input.chunkId,
      }).update({
        status: 'READY',
        objectKey: input.objectKey,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        providerGenerationId: input.providerGenerationId,
        error: null,
        completedAt: now,
        updatedAt: now,
      });
      await transaction.orm.public.Audio.where({
        id: input.audioId,
        status: 'PROCESSING',
      }).update({
        processingStage: 'GENERATING',
        totalChunks: input.totalChunks,
        completedChunks: input.completedChunks,
        provider: input.provider,
        voice: input.voice,
        error: null,
        updatedAt: now,
      });
      await transaction.orm.public.Job.where({
        id: input.jobId,
        status: 'PROCESSING',
      }).update({
        progress: toGenerationProgress(
          input.completedChunks,
          input.totalChunks,
        ),
        updatedAt: now,
      });
    });
  }

  private async updateGenerationProgress(
    job: ClaimedChapterTtsJob,
    totalChunks: number,
    completedChunks: number,
  ): Promise<void> {
    const now = temporalNow();

    await this.prisma.db.transaction(async (transaction) => {
      await transaction.orm.public.Audio.where({
        id: job.audioId,
        status: 'PROCESSING',
      }).update({
        processingStage: 'GENERATING',
        totalChunks,
        completedChunks,
        error: null,
        updatedAt: now,
      });
      await transaction.orm.public.Job.where({
        id: job.id,
        status: 'PROCESSING',
      }).update({
        progress: toGenerationProgress(completedChunks, totalChunks),
        updatedAt: now,
      });
    });
  }

  private async prepareMerge(
    job: ClaimedChapterTtsJob,
    totalChunks: number,
  ): Promise<string | null> {
    const now = temporalNow();
    const idempotencyKey = `${MERGE_JOB_IDEMPOTENCY_KEY_PREFIX}:${job.audioId}`;

    return this.prisma.db.transaction(async (transaction) => {
      const activeAudio = (await transaction.orm.public.Audio.where({
        id: job.audioId,
        status: 'PROCESSING',
      }).first()) as PersistedAudio | null;
      const activeJob = (await transaction.orm.public.Job.where({
        id: job.id,
        type: 'SYNTHESIZE_CHAPTER',
        status: 'PROCESSING',
      }).first()) as PersistedJob | null;

      if (!activeAudio || !activeJob) {
        return null;
      }

      const chunks = (await transaction.orm.public.AudioChunk.where({
        audioId: job.audioId,
      }).all()) as PersistedAudioChunk[];

      if (
        chunks.length !== totalChunks ||
        chunks.some((chunk) => chunk.status !== 'READY' || !chunk.objectKey)
      ) {
        throw new Error('Chapter audio chunks are not ready to merge');
      }

      const existingJob = (await transaction.orm.public.Job.where({
        idempotencyKey,
      }).first()) as PersistedJob | null;
      const mergeJobId = existingJob?.id ?? randomUUID();

      if (!existingJob) {
        await transaction.orm.public.Job.create({
          id: mergeJobId,
          bookId: job.bookId,
          chapterId: job.chapterId,
          type: 'MERGE_CHAPTER_AUDIO',
          idempotencyKey,
          maxAttempts: JOB_MAX_ATTEMPTS,
          updatedAt: now,
        });
      } else if (existingJob.status !== 'PROCESSING') {
        await transaction.orm.public.Job.where({ id: existingJob.id }).update({
          status: 'QUEUED',
          attempts: 0,
          progress: 0,
          error: null,
          startedAt: null,
          completedAt: null,
          updatedAt: now,
        });
      }

      await transaction.orm.public.Audio.where({
        id: job.audioId,
        status: 'PROCESSING',
      }).update({
        processingStage: 'MERGING',
        totalChunks,
        completedChunks: totalChunks,
        error: null,
        updatedAt: now,
      });

      return mergeJobId;
    });
  }

  private async markSynthesisCompleted(jobId: string): Promise<void> {
    await this.prisma.db.orm.public.Job.where({
      id: jobId,
      type: 'SYNTHESIZE_CHAPTER',
      status: 'PROCESSING',
    }).update({
      status: 'COMPLETED',
      progress: 100,
      error: null,
      completedAt: temporalNow(),
      updatedAt: temporalNow(),
    });
  }

  private async isActive(
    job: Pick<ClaimedChapterTtsJob, 'id' | 'audioId'>,
  ): Promise<boolean> {
    const [audio, processingJob] = await Promise.all([
      this.prisma.db.orm.public.Audio.where({
        id: job.audioId,
        status: 'PROCESSING',
      }).first(),
      this.prisma.db.orm.public.Job.where({
        id: job.id,
        type: 'SYNTHESIZE_CHAPTER',
        status: 'PROCESSING',
      }).first(),
    ]);

    return Boolean(audio && processingJob);
  }
}

function getTemporaryPartObjectKey(
  userId: string,
  bookId: string,
  audioId: string,
  position: number,
): string {
  return `books/${userId}/${bookId}/temporary/audio/${audioId}/parts/${String(
    position,
  ).padStart(6, '0')}.mp3`;
}

function toGenerationProgress(
  completedChunks: number,
  totalChunks: number,
): number {
  if (!totalChunks) {
    return 5;
  }

  return 5 + Math.floor((80 * completedChunks) / totalChunks);
}

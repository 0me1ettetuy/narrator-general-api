import { createReadStream } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { temporalNow } from '../prisma/temporal.js';
import { StorageService } from '../storage/storage.service.js';
import {
  type AudioPartToMerge,
  AudioMergeService,
} from './audio-merge.service.js';

const AUDIO_MERGE_FAILED_ERROR = 'AUDIO_MERGE_FAILED';
const AUDIO_CLEANUP_FAILED_ERROR = 'AUDIO_CLEANUP_FAILED';
const MP3_MIME_TYPE = 'audio/mpeg';

type PersistedMergeJob = {
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

type PersistedAudio = {
  id: string;
  chapterId: string;
  status: 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';
  totalChunks: number;
  objectKey: string | null;
};

type PersistedAudioChunk = {
  id: string;
  position: number;
  status: 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';
  objectKey: string | null;
};

export type ClaimedAudioMergeJob = {
  id: string;
  bookId: string;
  chapterId: string;
  audioId: string;
  userId: string;
  maxAttempts: number;
  finalAudioIsReady: boolean;
};

@Injectable()
export class ChapterAudioMergeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audioMergeService: AudioMergeService,
    private readonly storageService: StorageService,
  ) {}

  async merge(jobId: string): Promise<ClaimedAudioMergeJob | null> {
    const claimedJob = await this.claim(jobId);

    if (!claimedJob) {
      return null;
    }

    if (claimedJob.finalAudioIsReady) {
      await this.cleanupAndComplete(claimedJob);

      return claimedJob;
    }

    const parts = await this.getReadyParts(claimedJob.audioId);
    const mergedAudio = await this.audioMergeService.merge(parts);

    try {
      const objectKey = getFinalAudioObjectKey(
        claimedJob.userId,
        claimedJob.bookId,
        claimedJob.chapterId,
        claimedJob.audioId,
      );

      await this.storageService.putObjectStream(
        objectKey,
        createReadStream(mergedAudio.filePath),
        MP3_MIME_TYPE,
      );
      await this.markAudioReady(claimedJob, objectKey, mergedAudio.byteSize);
    } finally {
      // A local cleanup failure must not turn an already stored final asset
      // into a failed job. The operating system can reclaim stale temp files.
      await mergedAudio.cleanup().catch(() => undefined);
    }

    await this.cleanupAndComplete(claimedJob);

    return claimedJob;
  }

  async recordFailure(jobId: string, isFinalAttempt: boolean): Promise<void> {
    const now = temporalNow();

    await this.prisma.db.transaction(async (transaction) => {
      const job = (await transaction.orm.public.Job.where({
        id: jobId,
        type: 'MERGE_CHAPTER_AUDIO',
        status: 'PROCESSING',
      }).first()) as PersistedMergeJob | null;

      if (!job) {
        return;
      }

      const audio = job.chapterId
        ? ((await transaction.orm.public.Audio.where({
            chapterId: job.chapterId,
          }).first()) as PersistedAudio | null)
        : null;
      const finalAudioIsReady =
        audio?.status === 'READY' && Boolean(audio.objectKey);
      const status = isFinalAttempt ? 'FAILED' : 'QUEUED';
      const error = finalAudioIsReady
        ? AUDIO_CLEANUP_FAILED_ERROR
        : AUDIO_MERGE_FAILED_ERROR;

      await transaction.orm.public.Job.where({ id: job.id }).update({
        status,
        progress: 0,
        error,
        completedAt: isFinalAttempt ? now : null,
        updatedAt: now,
      });

      if (audio && !finalAudioIsReady) {
        await transaction.orm.public.Audio.where({ id: audio.id }).update({
          status,
          processingStage: isFinalAttempt ? null : 'MERGING',
          error: isFinalAttempt ? AUDIO_MERGE_FAILED_ERROR : null,
          updatedAt: now,
        });
      }
    });
  }

  private async claim(jobId: string): Promise<ClaimedAudioMergeJob | null> {
    const now = temporalNow();

    return this.prisma.db.transaction(async (transaction) => {
      const job = (await transaction.orm.public.Job.where({
        id: jobId,
        type: 'MERGE_CHAPTER_AUDIO',
      }).first()) as PersistedMergeJob | null;

      // BullMQ owns concurrent execution. Accepting PROCESSING lets a retry
      // resume after a worker process dies before it writes its failure state.
      if (
        !job ||
        !job.chapterId ||
        (job.status !== 'QUEUED' && job.status !== 'PROCESSING')
      ) {
        return null;
      }

      const book = (await transaction.orm.public.Book.where({
        id: job.bookId,
      }).first()) as PersistedBook | null;
      const audio = (await transaction.orm.public.Audio.where({
        chapterId: job.chapterId,
      }).first()) as PersistedAudio | null;

      if (!book || !audio) {
        throw new Error('Audio merge job references missing data');
      }

      const finalAudioIsReady =
        audio.status === 'READY' && Boolean(audio.objectKey);

      await transaction.orm.public.Job.where({ id: job.id }).update({
        status: 'PROCESSING',
        attempts: job.attempts + 1,
        progress: finalAudioIsReady ? 95 : 5,
        error: null,
        startedAt: now,
        completedAt: null,
        updatedAt: now,
      });
      if (!finalAudioIsReady) {
        await transaction.orm.public.Audio.where({ id: audio.id }).update({
          status: 'PROCESSING',
          processingStage: 'MERGING',
          error: null,
          completedAt: null,
          updatedAt: now,
        });
      }

      return {
        id: job.id,
        bookId: book.id,
        chapterId: job.chapterId,
        audioId: audio.id,
        userId: book.userId,
        maxAttempts: job.maxAttempts,
        finalAudioIsReady,
      };
    });
  }

  private async getReadyParts(audioId: string): Promise<AudioPartToMerge[]> {
    const [audio, chunks] = await Promise.all([
      this.prisma.db.orm.public.Audio.where({ id: audioId }).first(),
      this.prisma.db.orm.public.AudioChunk.where({ audioId }).all(),
    ]);
    const persistedAudio = audio as PersistedAudio | null;
    const persistedChunks = chunks as PersistedAudioChunk[];

    if (
      !persistedAudio ||
      persistedChunks.length !== persistedAudio.totalChunks ||
      persistedChunks.some(
        (chunk) => chunk.status !== 'READY' || !chunk.objectKey,
      )
    ) {
      throw new Error('Audio chunks are not ready to merge');
    }

    return persistedChunks
      .sort(
        (first, second) =>
          first.position - second.position || first.id.localeCompare(second.id),
      )
      .map((chunk) => ({
        position: chunk.position,
        objectKey: chunk.objectKey as string,
      }));
  }

  private async markAudioReady(
    job: ClaimedAudioMergeJob,
    objectKey: string,
    byteSize: number,
  ): Promise<void> {
    const now = temporalNow();

    await this.prisma.db.orm.public.Audio.where({ id: job.audioId }).update({
      status: 'READY',
      processingStage: null,
      objectKey,
      mimeType: MP3_MIME_TYPE,
      byteSize,
      error: null,
      completedAt: now,
      updatedAt: now,
    });
  }

  private async cleanupAndComplete(job: ClaimedAudioMergeJob): Promise<void> {
    const chunks = (await this.prisma.db.orm.public.AudioChunk.where({
      audioId: job.audioId,
    }).all()) as PersistedAudioChunk[];

    for (const chunk of chunks) {
      if (!chunk.objectKey) {
        throw new Error('Audio chunk is missing its temporary object key');
      }

      await this.storageService.deleteObject(chunk.objectKey);
    }

    const now = temporalNow();

    await this.prisma.db.transaction(async (transaction) => {
      await transaction.orm.public.AudioChunk.where({
        audioId: job.audioId,
      }).deleteAndCount();
      await transaction.orm.public.Job.where({
        id: job.id,
        type: 'MERGE_CHAPTER_AUDIO',
        status: 'PROCESSING',
      }).update({
        status: 'COMPLETED',
        progress: 100,
        error: null,
        completedAt: now,
        updatedAt: now,
      });
    });
  }
}

function getFinalAudioObjectKey(
  userId: string,
  bookId: string,
  chapterId: string,
  audioId: string,
): string {
  return `books/${userId}/${bookId}/audio/${chapterId}/${audioId}.mp3`;
}

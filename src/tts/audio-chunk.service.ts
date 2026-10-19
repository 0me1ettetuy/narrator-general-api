import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { temporalNow } from '../prisma/temporal.js';
import { ChapterSegmenter } from './chapter-segmenter.js';

type ExistingAudioChunk = {
  status: 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';
};

export type AudioChunkPlan = {
  audioId: string;
  totalChunks: number;
  completedChunks: number;
};

@Injectable()
export class AudioChunkService {
  private readonly chapterSegmenter = new ChapterSegmenter();

  constructor(private readonly prisma: PrismaService) {}

  async ensurePlan(audioId: string): Promise<AudioChunkPlan> {
    return this.prisma.db.transaction(async (transaction) => {
      const audio = await transaction.orm.public.Audio.where({
        id: audioId,
      }).first();

      if (!audio) {
        throw new Error('Audio asset not found');
      }

      const existingChunks = (await transaction.orm.public.AudioChunk.where({
        audioId: audio.id,
      }).all()) as ExistingAudioChunk[];

      if (existingChunks.length) {
        const completedChunks = existingChunks.filter(
          (chunk) => chunk.status === 'READY',
        ).length;

        await transaction.orm.public.Audio.where({ id: audio.id }).update({
          totalChunks: existingChunks.length,
          completedChunks,
          updatedAt: temporalNow(),
        });

        return {
          audioId: audio.id,
          totalChunks: existingChunks.length,
          completedChunks,
        };
      }

      const chapter = await transaction.orm.public.Chapter.where({
        id: audio.chapterId,
      }).first();

      if (!chapter) {
        throw new Error('Audio chapter not found');
      }

      const segmentTexts = this.chapterSegmenter.segment(chapter.text);

      if (!segmentTexts.length) {
        throw new Error('Chapter contains no text to synthesize');
      }

      const now = temporalNow();

      for (const [position, text] of segmentTexts.entries()) {
        await transaction.orm.public.AudioChunk.create({
          id: randomUUID(),
          audioId: audio.id,
          position,
          text,
          textChecksum: createTextChecksum(text),
          updatedAt: now,
        });
      }

      await transaction.orm.public.Audio.where({ id: audio.id }).update({
        totalChunks: segmentTexts.length,
        completedChunks: 0,
        updatedAt: now,
      });

      return {
        audioId: audio.id,
        totalChunks: segmentTexts.length,
        completedChunks: 0,
      };
    });
  }
}

function createTextChecksum(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

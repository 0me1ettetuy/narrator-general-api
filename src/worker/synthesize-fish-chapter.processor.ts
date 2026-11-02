import { Processor } from '@nestjs/bullmq';
import { type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FISH_CHAPTER_TTS_QUEUE } from '../jobs/jobs.constants.js';
import { ChapterTtsService } from '../tts/chapter-tts.service.js';
import { SynthesizeChapterProcessor } from './synthesize-chapter.processor.js';

const DEFAULT_FISH_TTS_CONCURRENCY = 2;

// Remote Fish work runs in parallel; the default stays under per-key limits.
@Processor(FISH_CHAPTER_TTS_QUEUE, {
  concurrency: DEFAULT_FISH_TTS_CONCURRENCY,
})
export class SynthesizeFishChapterProcessor
  extends SynthesizeChapterProcessor
  implements OnApplicationBootstrap
{
  constructor(
    chapterTtsService: ChapterTtsService,
    private readonly configService: ConfigService,
  ) {
    super(chapterTtsService);
  }

  // Decorator options are static, so apply the env value once the worker exists.
  onApplicationBootstrap(): void {
    this.worker.concurrency = getPositiveInteger(
      this.configService.get<string>('TTS_FISH_CONCURRENCY'),
      DEFAULT_FISH_TTS_CONCURRENCY,
    );
  }
}

function getPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return value && Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : fallback;
}

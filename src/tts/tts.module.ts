import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { TtsModelsModule } from '../tts-models/tts-models.module.js';
import { ChatterboxTtsAdapter } from './adapters/chatterbox-tts.adapter.js';
import { KokoroTtsAdapter } from './adapters/kokoro-tts.adapter.js';
import { PiperTtsAdapter } from './adapters/piper-tts.adapter.js';
import { Qwen3TtsAdapter } from './adapters/qwen3-tts.adapter.js';
import { AudioChunkService } from './audio-chunk.service.js';
import { AudioMergeService } from './audio-merge.service.js';
import { ChapterAudioMergeService } from './chapter-audio-merge.service.js';
import { ChapterTtsService } from './chapter-tts.service.js';
import { TtsService } from './tts.service.js';
import { TtsAdapterResolverService } from './tts-adapter-resolver.service.js';

@Module({
  imports: [JobsModule, PrismaModule, StorageModule, TtsModelsModule],
  providers: [
    AudioChunkService,
    AudioMergeService,
    ChapterAudioMergeService,
    ChapterTtsService,
    TtsService,
    PiperTtsAdapter,
    KokoroTtsAdapter,
    Qwen3TtsAdapter,
    ChatterboxTtsAdapter,
    TtsAdapterResolverService,
  ],
  exports: [
    AudioChunkService,
    AudioMergeService,
    ChapterAudioMergeService,
    ChapterTtsService,
    TtsService,
    TtsAdapterResolverService,
  ],
})
export class TtsModule {}

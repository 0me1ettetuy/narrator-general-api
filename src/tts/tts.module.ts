import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { AudioChunkService } from './audio-chunk.service.js';
import { AudioMergeService } from './audio-merge.service.js';
import { ChapterTtsService } from './chapter-tts.service.js';
import { TtsService } from './tts.service.js';

@Module({
  imports: [JobsModule, PrismaModule, StorageModule],
  providers: [
    AudioChunkService,
    AudioMergeService,
    ChapterTtsService,
    TtsService,
  ],
  exports: [
    AudioChunkService,
    AudioMergeService,
    ChapterTtsService,
    TtsService,
  ],
})
export class TtsModule {}

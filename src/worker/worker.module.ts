import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BooksModule } from '../books/books.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { TtsModule } from '../tts/tts.module.js';
import { MergeAudioProcessor } from './merge-audio.processor.js';
import { ParseBookProcessor } from './parse-book.processor.js';
import { SynthesizeChapterProcessor } from './synthesize-chapter.processor.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BooksModule,
    JobsModule,
    TtsModule,
  ],
  providers: [
    ParseBookProcessor,
    SynthesizeChapterProcessor,
    MergeAudioProcessor,
  ],
})
export class WorkerModule {}

import { Module } from '@nestjs/common';
import { TtsService } from './tts.service.js';

@Module({
  providers: [TtsService],
  exports: [TtsService],
})
export class TtsModule {}

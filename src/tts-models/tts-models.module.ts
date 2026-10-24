import { Module } from '@nestjs/common';
import { TtsModelAvailabilityService } from './tts-model-availability.service.js';
import { TtsModelRegistryService } from './tts-model-registry.service.js';
import { TtsModelsController } from './tts-models.controller.js';
import { TtsModelsService } from './tts-models.service.js';

@Module({
  controllers: [TtsModelsController],
  providers: [
    TtsModelAvailabilityService,
    TtsModelRegistryService,
    TtsModelsService,
  ],
  exports: [
    TtsModelAvailabilityService,
    TtsModelRegistryService,
    TtsModelsService,
  ],
})
export class TtsModelsModule {}

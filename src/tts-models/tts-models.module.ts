import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { FishCredentialService } from './fish-credential.service.js';
import { FishVoiceService } from './fish-voice.service.js';
import { TtsModelAvailabilityService } from './tts-model-availability.service.js';
import { TtsModelRegistryService } from './tts-model-registry.service.js';
import { TtsModelsController } from './tts-models.controller.js';
import { TtsModelsService } from './tts-models.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [TtsModelsController],
  providers: [
    FishCredentialService,
    FishVoiceService,
    TtsModelAvailabilityService,
    TtsModelRegistryService,
    TtsModelsService,
  ],
  exports: [
    FishCredentialService,
    FishVoiceService,
    TtsModelAvailabilityService,
    TtsModelRegistryService,
    TtsModelsService,
  ],
})
export class TtsModelsModule {}

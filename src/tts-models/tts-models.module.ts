import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { FishCredentialService } from './fish-credential.service.js';
import { TtsModelAvailabilityService } from './tts-model-availability.service.js';
import { TtsModelRegistryService } from './tts-model-registry.service.js';
import { TtsModelsController } from './tts-models.controller.js';
import { TtsModelsService } from './tts-models.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [TtsModelsController],
  providers: [
    FishCredentialService,
    TtsModelAvailabilityService,
    TtsModelRegistryService,
    TtsModelsService,
  ],
  exports: [
    FishCredentialService,
    TtsModelAvailabilityService,
    TtsModelRegistryService,
    TtsModelsService,
  ],
})
export class TtsModelsModule {}

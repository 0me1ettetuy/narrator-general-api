import { Injectable } from '@nestjs/common';
import type {
  TtsModelResponse,
  TtsModelsResponse,
} from './contracts/tts-models.response.js';
import { TtsModelAvailabilityService } from './tts-model-availability.service.js';
import { TtsModelRegistryService } from './tts-model-registry.service.js';

@Injectable()
export class TtsModelsService {
  constructor(
    private readonly registry: TtsModelRegistryService,
    private readonly availability: TtsModelAvailabilityService,
  ) {}

  async listModels(): Promise<TtsModelsResponse> {
    const models = await Promise.all(
      this.registry
        .getLocalModels()
        .map(async (model): Promise<TtsModelResponse> => {
          const availability =
            await this.availability.getLocalModelAvailability(model);

          return {
            id: model.id,
            provider: model.provider,
            displayName: model.displayName,
            source: 'LOCAL',
            ...availability,
          };
        }),
    );

    return {
      groups: [
        {
          id: 'local',
          displayName: 'Local models',
          models,
        },
      ],
    };
  }
}

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { API_ERROR_CODES } from '../global-filters/api-error.js';
import type {
  TtsModelResponse,
  TtsModelsResponse,
} from './contracts/tts-models.response.js';
import { TtsModelAvailabilityService } from './tts-model-availability.service.js';
import { TtsModelRegistryService } from './tts-model-registry.service.js';
import type { ConfiguredLocalTtsModel } from './types/tts-model.type.js';

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

  async getSelectableLocalModel(
    modelId: string,
  ): Promise<ConfiguredLocalTtsModel> {
    const model = this.registry
      .getLocalModels()
      .find((candidate) => candidate.id === modelId);

    if (!model) {
      throw new NotFoundException({
        code: API_ERROR_CODES.ttsModelNotFound,
        message: 'TTS model not found',
      });
    }

    const availability =
      await this.availability.getLocalModelAvailability(model);

    if (!availability.selectable) {
      throw new ConflictException({
        code: API_ERROR_CODES.ttsModelUnavailable,
        message: 'TTS model is unavailable',
      });
    }

    return model;
  }
}

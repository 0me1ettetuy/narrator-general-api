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
import { FishCredentialService } from './fish-credential.service.js';
import { TtsModelAvailabilityService } from './tts-model-availability.service.js';
import { TtsModelRegistryService } from './tts-model-registry.service.js';
import type { ConfiguredLocalTtsModel } from './types/tts-model.type.js';

export type SelectableTtsModel = {
  id: string;
  source: 'LOCAL' | 'FISH';
  providerModel: string | null;
};

@Injectable()
export class TtsModelsService {
  constructor(
    private readonly registry: TtsModelRegistryService,
    private readonly availability: TtsModelAvailabilityService,
    private readonly fishCredentials: FishCredentialService,
  ) {}

  async listModels(userId: string): Promise<TtsModelsResponse> {
    const [localModels, fishCredential] = await Promise.all([
      this.getLocalModelResponses(),
      this.fishCredentials.getPublicStatus(userId),
    ]);
    const groups: TtsModelsResponse['groups'] = [
      {
        id: 'local',
        displayName: 'Local models',
        models: localModels,
      },
    ];

    if (fishCredential.credentialState === 'VALID') {
      groups.push({
        id: 'fish-audio',
        displayName: 'Fish Audio',
        models: this.registry.getFishModels().map((model) => ({
          id: model.id,
          provider: 'fish-audio',
          displayName: model.displayName,
          source: 'FISH',
          status: model.enabled ? 'READY' : 'DISABLED',
          selectable: model.enabled,
          reasonCode: model.enabled ? null : 'MODEL_DISABLED',
        })),
      });
    }

    return {
      providers: [fishCredential],
      groups,
    };
  }

  async getSelectableModel(
    userId: string,
    modelId: string | null,
  ): Promise<SelectableTtsModel> {
    if (!modelId) {
      return this.getDefaultFishModel(userId);
    }

    const localModel = this.registry
      .getLocalModels()
      .find((candidate) => candidate.id === modelId);

    if (localModel) {
      await this.assertSelectableLocalModel(localModel);

      return {
        id: localModel.id,
        source: 'LOCAL',
        providerModel: null,
      };
    }

    const fishModel = this.registry
      .getFishModels()
      .find((candidate) => candidate.id === modelId);

    if (!fishModel) {
      throw new NotFoundException({
        code: API_ERROR_CODES.ttsModelNotFound,
        message: 'TTS model not found',
      });
    }

    if (!fishModel.enabled) {
      throw new ConflictException({
        code: API_ERROR_CODES.ttsModelUnavailable,
        message: 'TTS model is unavailable',
      });
    }

    await this.fishCredentials.assertValidCredential(userId);

    return {
      id: fishModel.id,
      source: 'FISH',
      providerModel: fishModel.providerModel,
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

    await this.assertSelectableLocalModel(model);

    return model;
  }

  private async getLocalModelResponses(): Promise<TtsModelResponse[]> {
    return Promise.all(
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
  }

  private async getDefaultFishModel(
    userId: string,
  ): Promise<SelectableTtsModel> {
    const model = this.registry
      .getFishModels()
      .find((candidate) => candidate.enabled);

    if (!model) {
      throw new ConflictException({
        code: API_ERROR_CODES.ttsModelUnavailable,
        message: 'No default TTS model is configured',
      });
    }

    await this.fishCredentials.assertValidCredential(userId);

    return {
      id: model.id,
      source: 'FISH',
      providerModel: model.providerModel,
    };
  }

  private async assertSelectableLocalModel(
    model: ConfiguredLocalTtsModel,
  ): Promise<void> {
    const availability =
      await this.availability.getLocalModelAvailability(model);

    if (!availability.selectable) {
      throw new ConflictException({
        code: API_ERROR_CODES.ttsModelUnavailable,
        message: 'TTS model is unavailable',
      });
    }
  }
}

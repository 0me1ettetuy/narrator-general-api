import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ConfiguredFishTtsModel,
  ConfiguredLocalTtsModel,
  FishTtsModelDefinition,
  LocalTtsModelDefinition,
} from './types/tts-model.type.js';

// Only Silero TTS is enabled. Qwen3-TTS, Piper, Kokoro and Chatterbox are
// removed; see docs/tts/local-tts-models-removed.md.
const LOCAL_TTS_MODEL_DEFINITIONS: LocalTtsModelDefinition[] = [
  {
    id: 'local.silero-tts',
    provider: 'local-silero-tts',
    displayName: 'Silero TTS (RU/EN)',
    enabledConfigKey: 'TTS_LOCAL_SILERO_TTS_ENABLED',
    healthUrlConfigKey: 'TTS_LOCAL_SILERO_TTS_HEALTH_URL',
    synthesisUrlConfigKey: 'TTS_LOCAL_SILERO_TTS_URL',
    healthStrategy: 'JSON_STATUS_HEALTHY',
    // Single source of truth for the voices users can pick. The Silero server
    // validates the id against the speakers its model actually has.
    voices: [
      { id: 'xenia', language: 'ru', displayName: 'Xenia' },
      { id: 'kseniya', language: 'ru', displayName: 'Kseniya' },
      { id: 'baya', language: 'ru', displayName: 'Baya' },
      { id: 'aidar', language: 'ru', displayName: 'Aidar' },
      { id: 'eugene', language: 'ru', displayName: 'Eugene' },
      { id: 'en_0', language: 'en', displayName: 'English 1' },
      { id: 'en_1', language: 'en', displayName: 'English 2' },
      { id: 'en_2', language: 'en', displayName: 'English 3' },
      { id: 'en_3', language: 'en', displayName: 'English 4' },
      { id: 'en_4', language: 'en', displayName: 'English 5' },
    ],
  },
];

const FISH_TTS_MODEL_DEFINITIONS: FishTtsModelDefinition[] = [
  {
    id: 'fish.s2.1-pro-free',
    providerModel: 's2.1-pro-free',
    displayName: 'Fish Audio — S2.1 Pro Free',
    enabledConfigKey: 'TTS_FISH_S2_1_PRO_FREE_ENABLED',
  },
  {
    id: 'fish.s2.1-pro',
    providerModel: 's2.1-pro',
    displayName: 'Fish Audio — S2.1 Pro',
    enabledConfigKey: 'TTS_FISH_S2_1_PRO_ENABLED',
  },
];

@Injectable()
export class TtsModelRegistryService {
  private readonly localModels: ConfiguredLocalTtsModel[];
  private readonly fishModels: ConfiguredFishTtsModel[];

  constructor(private readonly configService: ConfigService) {
    this.localModels = LOCAL_TTS_MODEL_DEFINITIONS.map((definition) =>
      this.configureLocalModel(definition),
    );
    this.fishModels = FISH_TTS_MODEL_DEFINITIONS.map((definition) =>
      this.configureFishModel(definition),
    );
  }

  getLocalModels(): readonly ConfiguredLocalTtsModel[] {
    return this.localModels;
  }

  getFishModels(): readonly ConfiguredFishTtsModel[] {
    return this.fishModels;
  }

  private configureLocalModel(
    definition: LocalTtsModelDefinition,
  ): ConfiguredLocalTtsModel {
    const enabled = this.getBooleanConfig(definition.enabledConfigKey);

    if (!enabled) {
      return {
        id: definition.id,
        provider: definition.provider,
        displayName: definition.displayName,
        enabled: false,
        healthUrl: null,
        synthesisUrl: null,
        healthStrategy: definition.healthStrategy,
        voices: definition.voices,
      };
    }

    const healthUrl = this.getRequiredHttpUrl(definition.healthUrlConfigKey);
    const synthesisUrl = this.getRequiredHttpUrl(
      definition.synthesisUrlConfigKey,
    );

    return {
      id: definition.id,
      provider: definition.provider,
      displayName: definition.displayName,
      enabled: true,
      healthUrl,
      synthesisUrl,
      healthStrategy: definition.healthStrategy,
      voices: definition.voices,
    };
  }

  private configureFishModel(
    definition: FishTtsModelDefinition,
  ): ConfiguredFishTtsModel {
    return {
      id: definition.id,
      providerModel: definition.providerModel,
      displayName: definition.displayName,
      enabled: this.getBooleanConfig(
        definition.enabledConfigKey,
        definition.id === 'fish.s2.1-pro-free',
      ),
    };
  }

  private getBooleanConfig(key: string, fallback = false): boolean {
    const value = this.configService.get<string>(key)?.trim().toLowerCase();

    if (!value) {
      return fallback;
    }

    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }

    throw new Error(`${key} must be true or false`);
  }

  private getRequiredHttpUrl(key: string): string {
    const value = this.configService.get<string>(key)?.trim();

    if (!value) {
      throw new Error(`${key} is required when its local model is enabled`);
    }

    let url: URL;

    try {
      url = new URL(value);
    } catch {
      throw new Error(`${key} must be a valid HTTP URL`);
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`${key} must be a valid HTTP URL`);
    }

    return url.toString();
  }
}

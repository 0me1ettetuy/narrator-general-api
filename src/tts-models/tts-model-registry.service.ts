import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ConfiguredLocalTtsModel,
  LocalTtsModelDefinition,
} from './types/tts-model.type.js';

const LOCAL_TTS_MODEL_DEFINITIONS: LocalTtsModelDefinition[] = [
  {
    id: 'local.piper.en-us-amy',
    provider: 'local-piper',
    displayName: 'Piper — English (Amy)',
    enabledConfigKey: 'TTS_LOCAL_PIPER_EN_US_AMY_ENABLED',
    healthUrlConfigKey: 'TTS_LOCAL_PIPER_EN_US_AMY_HEALTH_URL',
    healthStrategy: 'HTTP_OK',
  },
  {
    id: 'local.kokoro-82m',
    provider: 'local-kokoro',
    displayName: 'Kokoro-82M',
    enabledConfigKey: 'TTS_LOCAL_KOKORO_82M_ENABLED',
    healthUrlConfigKey: 'TTS_LOCAL_KOKORO_82M_HEALTH_URL',
    healthStrategy: 'HTTP_OK',
  },
  {
    id: 'local.qwen3-tts-0.6b',
    provider: 'local-qwen3-tts',
    displayName: 'Qwen3-TTS 0.6B',
    enabledConfigKey: 'TTS_LOCAL_QWEN3_TTS_0_6B_ENABLED',
    healthUrlConfigKey: 'TTS_LOCAL_QWEN3_TTS_0_6B_HEALTH_URL',
    healthStrategy: 'HTTP_OK',
  },
  {
    id: 'local.chatterbox-turbo',
    provider: 'local-chatterbox',
    displayName: 'Chatterbox Turbo',
    enabledConfigKey: 'TTS_LOCAL_CHATTERBOX_TURBO_ENABLED',
    healthUrlConfigKey: 'TTS_LOCAL_CHATTERBOX_TURBO_HEALTH_URL',
    healthStrategy: 'JSON_STATUS_READY',
  },
];

@Injectable()
export class TtsModelRegistryService {
  private readonly localModels: ConfiguredLocalTtsModel[];

  constructor(private readonly configService: ConfigService) {
    this.localModels = LOCAL_TTS_MODEL_DEFINITIONS.map((definition) =>
      this.configureLocalModel(definition),
    );
  }

  getLocalModels(): readonly ConfiguredLocalTtsModel[] {
    return this.localModels;
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
        healthStrategy: definition.healthStrategy,
      };
    }

    const healthUrl = this.getRequiredHttpUrl(definition.healthUrlConfigKey);

    return {
      id: definition.id,
      provider: definition.provider,
      displayName: definition.displayName,
      enabled: true,
      healthUrl,
      healthStrategy: definition.healthStrategy,
    };
  }

  private getBooleanConfig(key: string): boolean {
    const value = this.configService.get<string>(key)?.trim().toLowerCase();

    if (!value) {
      return false;
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

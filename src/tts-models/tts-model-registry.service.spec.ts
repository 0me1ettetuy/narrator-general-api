import type { ConfigService } from '@nestjs/config';
import { TtsModelRegistryService } from './tts-model-registry.service.js';

describe('TtsModelRegistryService', () => {
  const createConfigService = (values: Record<string, string | undefined>) =>
    ({
      get: jest.fn((key: string) => values[key]),
    }) as unknown as ConfigService;

  it('lists local models as disabled when no model is enabled', () => {
    const service = new TtsModelRegistryService(createConfigService({}));

    expect(service.getLocalModels()).toEqual([
      {
        id: 'local.piper.en-us-amy',
        provider: 'local-piper',
        displayName: 'Piper — English (Amy)',
        enabled: false,
        healthUrl: null,
        healthStrategy: 'HTTP_OK',
      },
      {
        id: 'local.kokoro-82m',
        provider: 'local-kokoro',
        displayName: 'Kokoro-82M',
        enabled: false,
        healthUrl: null,
        healthStrategy: 'HTTP_OK',
      },
      {
        id: 'local.qwen3-tts-0.6b',
        provider: 'local-qwen3-tts',
        displayName: 'Qwen3-TTS 0.6B',
        enabled: false,
        healthUrl: null,
        healthStrategy: 'HTTP_OK',
      },
      {
        id: 'local.chatterbox-turbo',
        provider: 'local-chatterbox',
        displayName: 'Chatterbox Turbo',
        enabled: false,
        healthUrl: null,
        healthStrategy: 'JSON_STATUS_READY',
      },
    ]);
  });

  it('configures an enabled model with its health URL', () => {
    const service = new TtsModelRegistryService(
      createConfigService({
        TTS_LOCAL_PIPER_EN_US_AMY_ENABLED: 'true',
        TTS_LOCAL_PIPER_EN_US_AMY_HEALTH_URL: 'http://localhost:9100/health',
      }),
    );

    expect(service.getLocalModels()[0]).toMatchObject({
      id: 'local.piper.en-us-amy',
      enabled: true,
      healthUrl: 'http://localhost:9100/health',
    });
  });

  it('fails fast when an enabled model has no health URL', () => {
    expect(
      () =>
        new TtsModelRegistryService(
          createConfigService({
            TTS_LOCAL_PIPER_EN_US_AMY_ENABLED: 'true',
          }),
        ),
    ).toThrow('TTS_LOCAL_PIPER_EN_US_AMY_HEALTH_URL is required');
  });

  it('rejects an invalid enabled flag', () => {
    expect(
      () =>
        new TtsModelRegistryService(
          createConfigService({
            TTS_LOCAL_KOKORO_82M_ENABLED: 'sometimes',
          }),
        ),
    ).toThrow('TTS_LOCAL_KOKORO_82M_ENABLED must be true or false');
  });
});

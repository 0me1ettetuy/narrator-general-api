import type { ConfigService } from '@nestjs/config';
import { TtsModelRegistryService } from './tts-model-registry.service.js';

describe('TtsModelRegistryService', () => {
  const createConfigService = (values: Record<string, string | undefined>) =>
    ({
      get: jest.fn((key: string) => values[key]),
    }) as unknown as ConfigService;

  it('lists the local models disabled by default, with no URLs', () => {
    const service = new TtsModelRegistryService(createConfigService({}));

    expect(service.getLocalModels()).toEqual([
      expect.objectContaining({
        id: 'local.silero-tts',
        enabled: false,
        healthUrl: null,
        synthesisUrl: null,
      }),
      expect.objectContaining({
        id: 'local.qwen3-tts-0-6b',
        enabled: false,
        healthUrl: null,
        synthesisUrl: null,
      }),
    ]);
  });

  it('exposes Silero TTS URLs once enabled', () => {
    const service = new TtsModelRegistryService(
      createConfigService({
        TTS_LOCAL_SILERO_TTS_ENABLED: 'true',
        TTS_LOCAL_SILERO_TTS_HEALTH_URL: 'http://silero-tts:8001/health',
        TTS_LOCAL_SILERO_TTS_URL: 'http://silero-tts:8001',
      }),
    );

    expect(service.getLocalModels()[0]).toEqual(
      expect.objectContaining({
        enabled: true,
        healthUrl: 'http://silero-tts:8001/health',
        synthesisUrl: 'http://silero-tts:8001/',
      }),
    );
  });

  it('lists each Qwen3-TTS speaker for both Russian and English', () => {
    const qwen = new TtsModelRegistryService(createConfigService({}))
      .getLocalModels()
      .find((model) => model.id === 'local.qwen3-tts-0-6b');

    expect(qwen?.voices).toContainEqual({
      id: 'ryan',
      language: 'ru',
      displayName: 'Ryan',
    });
    expect(qwen?.voices).toContainEqual({
      id: 'ryan',
      language: 'en',
      displayName: 'Ryan',
    });
  });

  it('refuses to enable Silero TTS without its health URL', () => {
    expect(
      () =>
        new TtsModelRegistryService(
          createConfigService({
            TTS_LOCAL_SILERO_TTS_ENABLED: 'true',
            TTS_LOCAL_SILERO_TTS_URL: 'http://silero-tts:8001',
          }),
        ),
    ).toThrow('TTS_LOCAL_SILERO_TTS_HEALTH_URL is required');
  });
});

// Coverage for the local-model configuration logic itself (enabled flag,
// required health/synthesis URL, validation errors) is preserved for
// restoration in docs/tts/local-tts-models-removed.md's restore steps, which
// point back to this file's prior git history.

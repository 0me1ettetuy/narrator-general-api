import type { ConfigService } from '@nestjs/config';
import { TtsModelRegistryService } from './tts-model-registry.service.js';

describe('TtsModelRegistryService', () => {
  const createConfigService = (values: Record<string, string | undefined>) =>
    ({
      get: jest.fn((key: string) => values[key]),
    }) as unknown as ConfigService;

  // Local TTS models are disabled (docs/tts/local-tts-models-removed.md);
  // the definitions list is empty, so there is nothing to configure.
  it('lists no local models while local TTS is disabled', () => {
    const service = new TtsModelRegistryService(createConfigService({}));

    expect(service.getLocalModels()).toEqual([]);
  });
});

// Coverage for the local-model configuration logic itself (enabled flag,
// required health/synthesis URL, validation errors) is preserved for
// restoration in docs/tts/local-tts-models-removed.md's restore steps, which
// point back to this file's prior git history.

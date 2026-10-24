import { TtsModelAvailabilityService } from './tts-model-availability.service.js';
import { TtsModelRegistryService } from './tts-model-registry.service.js';
import { TtsModelsService } from './tts-models.service.js';

describe('TtsModelsService', () => {
  it('returns local models in one frontend-ready group', async () => {
    const registry = {
      getLocalModels: jest.fn().mockReturnValue([
        {
          id: 'local.piper.en-us-amy',
          provider: 'local-piper',
          displayName: 'Piper — English (Amy)',
          enabled: true,
          healthUrl: 'http://localhost:9100/health',
          synthesisUrl: 'http://localhost:9100/',
          healthStrategy: 'HTTP_OK',
        },
      ]),
    } as unknown as TtsModelRegistryService;
    const availability = {
      getLocalModelAvailability: jest.fn().mockResolvedValue({
        status: 'READY',
        selectable: true,
        reasonCode: null,
      }),
    } as unknown as TtsModelAvailabilityService;
    const service = new TtsModelsService(registry, availability);

    await expect(service.listModels()).resolves.toEqual({
      groups: [
        {
          id: 'local',
          displayName: 'Local models',
          models: [
            {
              id: 'local.piper.en-us-amy',
              provider: 'local-piper',
              displayName: 'Piper — English (Amy)',
              source: 'LOCAL',
              status: 'READY',
              selectable: true,
              reasonCode: null,
            },
          ],
        },
      ],
    });
  });

  it('rejects an unavailable local model with a stable conflict code', async () => {
    const registry = {
      getLocalModels: jest.fn().mockReturnValue([
        {
          id: 'local.kokoro-82m',
          provider: 'local-kokoro',
          displayName: 'Kokoro-82M',
          enabled: true,
          healthUrl: 'http://localhost:7860/health/ready',
          synthesisUrl: 'http://localhost:7860/',
          healthStrategy: 'HTTP_OK',
        },
      ]),
    } as unknown as TtsModelRegistryService;
    const availability = {
      getLocalModelAvailability: jest.fn().mockResolvedValue({
        status: 'UNAVAILABLE',
        selectable: false,
        reasonCode: 'MODEL_SERVICE_UNREACHABLE',
      }),
    } as unknown as TtsModelAvailabilityService;
    const service = new TtsModelsService(registry, availability);

    await expect(
      service.getSelectableLocalModel('local.kokoro-82m'),
    ).rejects.toMatchObject({
      response: {
        code: 'TTS_MODEL_UNAVAILABLE',
      },
    });
  });
});

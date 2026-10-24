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
});

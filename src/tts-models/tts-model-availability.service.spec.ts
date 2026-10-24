import type { ConfigService } from '@nestjs/config';
import { TtsModelAvailabilityService } from './tts-model-availability.service.js';
import type { ConfiguredLocalTtsModel } from './types/tts-model.type.js';

const enabledModel: ConfiguredLocalTtsModel = {
  id: 'local.piper.en-us-amy',
  provider: 'local-piper',
  displayName: 'Piper — English (Amy)',
  enabled: true,
  healthUrl: 'http://localhost:9100/health',
  synthesisUrl: 'http://localhost:9100/',
  healthStrategy: 'HTTP_OK',
};

describe('TtsModelAvailabilityService', () => {
  const originalFetch = global.fetch;

  const createConfigService = (values: Record<string, string | undefined>) =>
    ({
      get: jest.fn((key: string) => values[key]),
    }) as unknown as ConfigService;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns disabled without probing a disabled model', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new TtsModelAvailabilityService(createConfigService({}));

    await expect(
      service.getLocalModelAvailability({ ...enabledModel, enabled: false }),
    ).resolves.toEqual({
      status: 'DISABLED',
      selectable: false,
      reasonCode: 'MODEL_DISABLED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns ready when the health endpoint responds successfully', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(null, { status: 204 }),
      ) as unknown as typeof fetch;
    const service = new TtsModelAvailabilityService(createConfigService({}));

    await expect(
      service.getLocalModelAvailability(enabledModel),
    ).resolves.toEqual({
      status: 'READY',
      selectable: true,
      reasonCode: null,
    });
  });

  it('returns a safe unavailable status when the health endpoint fails', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(
        new Error('Connection refused'),
      ) as unknown as typeof fetch;
    const service = new TtsModelAvailabilityService(createConfigService({}));

    await expect(
      service.getLocalModelAvailability(enabledModel),
    ).resolves.toEqual({
      status: 'UNAVAILABLE',
      selectable: false,
      reasonCode: 'MODEL_SERVICE_UNREACHABLE',
    });
  });

  it('caches successful health checks for the configured TTL', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new TtsModelAvailabilityService(
      createConfigService({
        TTS_MODEL_HEALTH_CACHE_TTL_MS: '15000',
      }),
    );

    await service.getLocalModelAvailability(enabledModel);
    await service.getLocalModelAvailability(enabledModel);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not mark a loading JSON-status service as ready', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: 'loading' }), { status: 200 }),
      ) as unknown as typeof fetch;
    const service = new TtsModelAvailabilityService(createConfigService({}));

    await expect(
      service.getLocalModelAvailability({
        ...enabledModel,
        healthStrategy: 'JSON_STATUS_HEALTHY',
      }),
    ).resolves.toEqual({
      status: 'UNAVAILABLE',
      selectable: false,
      reasonCode: 'MODEL_SERVICE_UNREACHABLE',
    });
  });
});

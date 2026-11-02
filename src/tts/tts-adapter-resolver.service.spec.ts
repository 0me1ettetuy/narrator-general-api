jest.mock('../tts-models/tts-models.service.js', () => ({
  TtsModelsService: class TtsModelsService {},
}));

jest.mock('./tts.service.js', () => ({
  TtsService: class TtsService {},
}));

import { TtsModelsService } from '../tts-models/tts-models.service.js';
import { TtsService } from './tts.service.js';
import { TtsAdapterResolverService } from './tts-adapter-resolver.service.js';

describe('TtsAdapterResolverService', () => {
  const fish = {} as TtsService;

  it('resolves a Fish adapter with its provider model for the owner', async () => {
    const models = {
      getSelectableModel: jest.fn().mockResolvedValue({
        id: 'fish.s2.1-pro-free',
        source: 'FISH',
        providerModel: 's2.1-pro-free',
      }),
    } as unknown as TtsModelsService;
    const resolver = new TtsAdapterResolverService(fish, models);

    await expect(resolver.resolve('user-id', null)).resolves.toEqual({
      adapter: fish,
      source: 'FISH',
      providerModel: 's2.1-pro-free',
    });
    expect(models.getSelectableModel).toHaveBeenCalledWith('user-id', null);
  });

  // Local TTS models are disabled (docs/tts/local-tts-models-removed.md);
  // the registry no longer offers any, so this guards an otherwise
  // unreachable branch.
  it('rejects a local model instead of resolving a local adapter', async () => {
    const models = {
      getSelectableModel: jest.fn().mockResolvedValue({
        id: 'local.kokoro-82m',
        source: 'LOCAL',
        providerModel: null,
      }),
    } as unknown as TtsModelsService;
    const resolver = new TtsAdapterResolverService(fish, models);

    await expect(
      resolver.resolve('user-id', 'local.kokoro-82m'),
    ).rejects.toThrow('Local TTS models are currently disabled');
  });
});

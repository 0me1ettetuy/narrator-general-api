jest.mock('../tts-models/tts-models.service.js', () => ({
  TtsModelsService: class TtsModelsService {},
}));

jest.mock('./tts.service.js', () => ({
  TtsService: class TtsService {},
}));

import { TtsModelsService } from '../tts-models/tts-models.service.js';
import type { Qwen3TtsAdapter } from './adapters/qwen3-tts.adapter.js';
import { TtsService } from './tts.service.js';
import { TtsAdapterResolverService } from './tts-adapter-resolver.service.js';

describe('TtsAdapterResolverService', () => {
  const fish = {} as TtsService;
  const qwen = {} as Qwen3TtsAdapter;

  it('resolves a Fish adapter with its provider model for the owner', async () => {
    const models = {
      getSelectableModel: jest.fn().mockResolvedValue({
        id: 'fish.s2.1-pro-free',
        source: 'FISH',
        providerModel: 's2.1-pro-free',
      }),
    } as unknown as TtsModelsService;
    const resolver = new TtsAdapterResolverService(fish, qwen, models);

    await expect(resolver.resolve('user-id', null)).resolves.toEqual({
      adapter: fish,
      source: 'FISH',
      providerModel: 's2.1-pro-free',
    });
    expect(models.getSelectableModel).toHaveBeenCalledWith('user-id', null);
  });

  it('resolves local.qwen3-tts-0.6b to the Qwen3 adapter', async () => {
    const models = {
      getSelectableModel: jest.fn().mockResolvedValue({
        id: 'local.qwen3-tts-0.6b',
        source: 'LOCAL',
        providerModel: null,
      }),
    } as unknown as TtsModelsService;
    const resolver = new TtsAdapterResolverService(fish, qwen, models);

    await expect(
      resolver.resolve('user-id', 'local.qwen3-tts-0.6b'),
    ).resolves.toEqual({
      adapter: qwen,
      source: 'LOCAL',
      providerModel: null,
    });
  });

  it('rejects a local model that has no adapter', async () => {
    const models = {
      getSelectableModel: jest.fn().mockResolvedValue({
        id: 'local.kokoro-82m',
        source: 'LOCAL',
        providerModel: null,
      }),
    } as unknown as TtsModelsService;
    const resolver = new TtsAdapterResolverService(fish, qwen, models);

    await expect(
      resolver.resolve('user-id', 'local.kokoro-82m'),
    ).rejects.toThrow('TTS model does not have an adapter');
  });
});

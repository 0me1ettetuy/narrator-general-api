jest.mock('../tts-models/tts-models.service.js', () => ({
  TtsModelsService: class TtsModelsService {},
}));

jest.mock('./tts.service.js', () => ({
  TtsService: class TtsService {},
}));

import { TtsModelsService } from '../tts-models/tts-models.service.js';
import { ChatterboxTtsAdapter } from './adapters/chatterbox-tts.adapter.js';
import { KokoroTtsAdapter } from './adapters/kokoro-tts.adapter.js';
import { PiperTtsAdapter } from './adapters/piper-tts.adapter.js';
import { Qwen3TtsAdapter } from './adapters/qwen3-tts.adapter.js';
import { TtsService } from './tts.service.js';
import { TtsAdapterResolverService } from './tts-adapter-resolver.service.js';

describe('TtsAdapterResolverService', () => {
  const fish = {} as TtsService;
  const piper = {} as PiperTtsAdapter;
  const kokoro = {} as KokoroTtsAdapter;
  const qwen = {} as Qwen3TtsAdapter;
  const chatterbox = {} as ChatterboxTtsAdapter;

  it('resolves a Fish adapter with its provider model for the owner', async () => {
    const models = {
      getSelectableModel: jest.fn().mockResolvedValue({
        id: 'fish.s2.1-pro-free',
        source: 'FISH',
        providerModel: 's2.1-pro-free',
      }),
    } as unknown as TtsModelsService;
    const resolver = new TtsAdapterResolverService(
      fish,
      piper,
      kokoro,
      qwen,
      chatterbox,
      models,
    );

    await expect(resolver.resolve('user-id', null)).resolves.toEqual({
      adapter: fish,
      source: 'FISH',
      providerModel: 's2.1-pro-free',
    });
    expect(models.getSelectableModel).toHaveBeenCalledWith('user-id', null);
  });

  it('checks availability before returning a requested local adapter', async () => {
    const models = {
      getSelectableModel: jest.fn().mockResolvedValue({
        id: 'local.kokoro-82m',
        source: 'LOCAL',
        providerModel: null,
      }),
    } as unknown as TtsModelsService;
    const resolver = new TtsAdapterResolverService(
      fish,
      piper,
      kokoro,
      qwen,
      chatterbox,
      models,
    );

    await expect(
      resolver.resolve('user-id', 'local.kokoro-82m'),
    ).resolves.toEqual({
      adapter: kokoro,
      source: 'LOCAL',
      providerModel: null,
    });
  });
});

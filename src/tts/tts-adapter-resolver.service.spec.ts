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

  it('uses Fish Audio for legacy audio without a selected local model', async () => {
    const models = {
      getSelectableLocalModel: jest.fn(),
    } as unknown as TtsModelsService;
    const resolver = new TtsAdapterResolverService(
      fish,
      piper,
      kokoro,
      qwen,
      chatterbox,
      models,
    );

    await expect(resolver.resolve(null)).resolves.toBe(fish);
    expect(models.getSelectableLocalModel).not.toHaveBeenCalled();
  });

  it('checks live availability before returning the requested local adapter', async () => {
    const models = {
      getSelectableLocalModel: jest.fn().mockResolvedValue(undefined),
    } as unknown as TtsModelsService;
    const resolver = new TtsAdapterResolverService(
      fish,
      piper,
      kokoro,
      qwen,
      chatterbox,
      models,
    );

    await expect(resolver.resolve('local.kokoro-82m')).resolves.toBe(kokoro);
    expect(models.getSelectableLocalModel).toHaveBeenCalledWith(
      'local.kokoro-82m',
    );
  });
});

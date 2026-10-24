import { Injectable } from '@nestjs/common';
import {
  type SelectableTtsModel,
  TtsModelsService,
} from '../tts-models/tts-models.service.js';
import { ChatterboxTtsAdapter } from './adapters/chatterbox-tts.adapter.js';
import { KokoroTtsAdapter } from './adapters/kokoro-tts.adapter.js';
import { PiperTtsAdapter } from './adapters/piper-tts.adapter.js';
import { Qwen3TtsAdapter } from './adapters/qwen3-tts.adapter.js';
import { type TtsAdapter, TtsSynthesisError } from './adapters/tts-adapter.js';
import { TtsService } from './tts.service.js';

const LOCAL_TTS_ADAPTER_IDS = [
  'local.piper.en-us-amy',
  'local.kokoro-82m',
  'local.qwen3-tts-0.6b',
  'local.chatterbox-turbo',
] as const;

type LocalTtsAdapterId = (typeof LOCAL_TTS_ADAPTER_IDS)[number];

export type ResolvedTtsAdapter = {
  adapter: TtsAdapter;
  providerModel: string | null;
};

@Injectable()
export class TtsAdapterResolverService {
  private readonly localAdapters: ReadonlyMap<LocalTtsAdapterId, TtsAdapter>;

  constructor(
    private readonly fishAudioTtsAdapter: TtsService,
    private readonly piperTtsAdapter: PiperTtsAdapter,
    private readonly kokoroTtsAdapter: KokoroTtsAdapter,
    private readonly qwen3TtsAdapter: Qwen3TtsAdapter,
    private readonly chatterboxTtsAdapter: ChatterboxTtsAdapter,
    private readonly ttsModelsService: TtsModelsService,
  ) {
    this.localAdapters = new Map<LocalTtsAdapterId, TtsAdapter>([
      ['local.piper.en-us-amy', piperTtsAdapter],
      ['local.kokoro-82m', kokoroTtsAdapter],
      ['local.qwen3-tts-0.6b', qwen3TtsAdapter],
      ['local.chatterbox-turbo', chatterboxTtsAdapter],
    ]);
  }

  async resolve(
    userId: string,
    modelKey: string | null,
  ): Promise<ResolvedTtsAdapter> {
    const model = await this.ttsModelsService.getSelectableModel(
      userId,
      modelKey,
    );

    return this.toResolvedAdapter(model);
  }

  private toResolvedAdapter(model: SelectableTtsModel): ResolvedTtsAdapter {
    if (model.source === 'FISH') {
      return {
        adapter: this.fishAudioTtsAdapter,
        providerModel: model.providerModel,
      };
    }

    const adapter = this.localAdapters.get(model.id as LocalTtsAdapterId);

    if (!adapter) {
      throw new TtsSynthesisError('TTS model does not have an adapter');
    }

    return {
      adapter,
      providerModel: null,
    };
  }
}

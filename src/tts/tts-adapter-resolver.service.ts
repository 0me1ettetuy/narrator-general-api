import { Injectable } from '@nestjs/common';
import {
  type SelectableTtsModel,
  TtsModelsService,
} from '../tts-models/tts-models.service.js';
// Piper, Kokoro and Chatterbox are still disabled; see docs/tts/local-tts-models-removed.md.
import { Qwen3TtsAdapter } from './adapters/qwen3-tts.adapter.js';
import { type TtsAdapter, TtsSynthesisError } from './adapters/tts-adapter.js';
import { TtsService } from './tts.service.js';

const QWEN3_TTS_MODEL_ID = 'local.qwen3-tts-0.6b';

export type ResolvedTtsAdapter = {
  adapter: TtsAdapter;
  source: SelectableTtsModel['source'];
  providerModel: string | null;
};

@Injectable()
export class TtsAdapterResolverService {
  constructor(
    private readonly fishAudioTtsAdapter: TtsService,
    private readonly qwen3TtsAdapter: Qwen3TtsAdapter,
    private readonly ttsModelsService: TtsModelsService,
  ) {}

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
        source: model.source,
        providerModel: model.providerModel,
      };
    }

    if (model.id === QWEN3_TTS_MODEL_ID) {
      return {
        adapter: this.qwen3TtsAdapter,
        source: model.source,
        providerModel: null,
      };
    }

    throw new TtsSynthesisError('TTS model does not have an adapter');
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAiCompatibleLocalTtsAdapter } from './openai-compatible-local-tts.adapter.js';
import { type TtsSynthesisInput, TtsSynthesisError } from './tts-adapter.js';

const KOKORO_ENGLISH_MALE_VOICE = 'am_michael';

@Injectable()
export class KokoroTtsAdapter extends OpenAiCompatibleLocalTtsAdapter {
  protected readonly configuration = {
    provider: 'local-kokoro',
    model: 'kokoro',
    defaultVoice: KOKORO_ENGLISH_MALE_VOICE,
    urlConfigKey: 'TTS_LOCAL_KOKORO_82M_URL',
    voiceConfigKey: 'TTS_LOCAL_KOKORO_82M_VOICE',
  };

  constructor(configService: ConfigService) {
    super(configService);
  }

  protected override getVoice(input: TtsSynthesisInput): string {
    if (getPrimaryLanguage(input.language) === 'ru') {
      throw new TtsSynthesisError(
        'Kokoro-82M does not include a Russian voice',
      );
    }

    return super.getVoice(input);
  }
}

function getPrimaryLanguage(
  language: string | null | undefined,
): string | null {
  return language?.trim().toLowerCase().split(/[-_]/, 1)[0] ?? null;
}

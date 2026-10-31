import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAiCompatibleLocalTtsAdapter } from './openai-compatible-local-tts.adapter.js';
import type { TtsSynthesisInput } from './tts-adapter.js';

const PIPER_ENGLISH_MALE_VOICE = 'en_US-hfc_male-medium';
const PIPER_RUSSIAN_MALE_VOICE = 'ru_RU-denis-medium';

@Injectable()
export class PiperTtsAdapter extends OpenAiCompatibleLocalTtsAdapter {
  protected readonly configuration = {
    provider: 'local-piper',
    model: 'piper',
    defaultVoice: PIPER_ENGLISH_MALE_VOICE,
    urlConfigKey: 'TTS_LOCAL_PIPER_EN_US_AMY_URL',
    voiceConfigKey: 'TTS_LOCAL_PIPER_EN_US_AMY_VOICE',
  };

  constructor(configService: ConfigService) {
    super(configService);
  }

  protected override getVoice(input: TtsSynthesisInput): string {
    return getPrimaryLanguage(input.language) === 'ru'
      ? PIPER_RUSSIAN_MALE_VOICE
      : super.getVoice(input);
  }
}

function getPrimaryLanguage(
  language: string | null | undefined,
): string | null {
  return language?.trim().toLowerCase().split(/[-_]/, 1)[0] ?? null;
}

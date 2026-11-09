import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAiCompatibleLocalTtsAdapter } from './openai-compatible-local-tts.adapter.js';
import { type TtsSynthesisInput, TtsSynthesisError } from './tts-adapter.js';

const QWEN3_LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  ru: 'Russian',
  en: 'English',
};

@Injectable()
export class Qwen3TtsAdapter extends OpenAiCompatibleLocalTtsAdapter {
  protected readonly configuration = {
    provider: 'local-qwen3-tts',
    model: 'qwen3-tts',
    defaultVoice: 'ryan',
    urlConfigKey: 'TTS_LOCAL_QWEN3_TTS_URL',
    voiceConfigKey: 'TTS_LOCAL_QWEN3_TTS_VOICE',
  };

  constructor(configService: ConfigService) {
    super(configService);
  }

  // The chapter's snapshotted voice wins; otherwise the configured speaker, otherwise ryan.
  protected override getVoice(input: TtsSynthesisInput): string {
    return input.voiceId || super.getVoice(input);
  }

  protected override getProviderRequestFields(
    input: TtsSynthesisInput,
  ): Record<string, string> {
    return { language: toQwen3Language(input.language) };
  }
}

function toQwen3Language(language: string | null | undefined): string {
  const primaryLanguage = language?.trim().toLowerCase().split(/[-_]/, 1)[0];

  // No silent fallback: the model supports more languages, but only these are offered and verified.
  if (
    !primaryLanguage ||
    !Object.hasOwn(QWEN3_LANGUAGE_NAMES, primaryLanguage)
  ) {
    throw new TtsSynthesisError(
      `Qwen3-TTS supports Russian and English, not ${primaryLanguage || 'an unknown language'}`,
    );
  }

  return QWEN3_LANGUAGE_NAMES[primaryLanguage];
}

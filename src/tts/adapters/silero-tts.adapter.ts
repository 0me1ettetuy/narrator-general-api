import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAiCompatibleLocalTtsAdapter } from './openai-compatible-local-tts.adapter.js';
import { type TtsSynthesisInput, TtsSynthesisError } from './tts-adapter.js';

const SILERO_LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  ru: 'Russian',
  en: 'English',
};

@Injectable()
export class SileroTtsAdapter extends OpenAiCompatibleLocalTtsAdapter {
  protected readonly configuration = {
    provider: 'local-silero-tts',
    model: 'silero',
    // "auto" lets the Silero server pick its default speaker for the language.
    defaultVoice: 'auto',
    urlConfigKey: 'TTS_LOCAL_SILERO_TTS_URL',
    voiceConfigKey: 'TTS_LOCAL_SILERO_TTS_VOICE',
  };

  constructor(configService: ConfigService) {
    super(configService);
  }

  // The chapter's snapshotted voice wins; otherwise the configured speaker,
  // otherwise "auto" (the server's default for the language).
  protected override getVoice(input: TtsSynthesisInput): string {
    return input.voiceId || super.getVoice(input);
  }

  protected override getProviderRequestFields(
    input: TtsSynthesisInput,
  ): Record<string, string> {
    return {
      language: toSileroLanguage(input.language),
    };
  }
}

function toSileroLanguage(language: string | null | undefined): string {
  const primaryLanguage = language?.trim().toLowerCase().split(/[-_]/, 1)[0];

  // No silent fallback: Silero cannot detect a language, and a wrong guess would mispronounce the whole chapter.
  if (
    !primaryLanguage ||
    !Object.hasOwn(SILERO_LANGUAGE_NAMES, primaryLanguage)
  ) {
    throw new TtsSynthesisError(
      `Silero TTS supports Russian and English, not ${primaryLanguage || 'an unknown language'}`,
    );
  }

  return SILERO_LANGUAGE_NAMES[primaryLanguage];
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAiCompatibleLocalTtsAdapter } from './openai-compatible-local-tts.adapter.js';
import type { TtsSynthesisInput } from './tts-adapter.js';

const QWEN_LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  zh: 'Chinese',
  en: 'English',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  pt: 'Portuguese',
  ru: 'Russian',
  es: 'Spanish',
};

@Injectable()
export class Qwen3TtsAdapter extends OpenAiCompatibleLocalTtsAdapter {
  protected readonly configuration = {
    provider: 'local-qwen3-tts',
    model: 'tts-1',
    defaultVoice: 'ryan',
    urlConfigKey: 'TTS_LOCAL_QWEN3_TTS_0_6B_URL',
    voiceConfigKey: 'TTS_LOCAL_QWEN3_TTS_0_6B_VOICE',
  };

  constructor(configService: ConfigService) {
    super(configService);
  }

  protected override getProviderRequestFields(
    input: TtsSynthesisInput,
  ): Record<string, string> {
    return {
      language: toQwenLanguage(input.language),
    };
  }
}

function toQwenLanguage(language: string | null | undefined): string {
  const primaryLanguage = language?.trim().toLowerCase().split(/[-_]/, 1)[0];

  return primaryLanguage
    ? (QWEN_LANGUAGE_NAMES[primaryLanguage] ?? 'Auto')
    : 'Auto';
}

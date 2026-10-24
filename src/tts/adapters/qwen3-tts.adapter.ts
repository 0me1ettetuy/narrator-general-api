import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAiCompatibleLocalTtsAdapter } from './openai-compatible-local-tts.adapter.js';

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
}

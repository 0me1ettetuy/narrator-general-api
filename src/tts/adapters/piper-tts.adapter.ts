import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAiCompatibleLocalTtsAdapter } from './openai-compatible-local-tts.adapter.js';

@Injectable()
export class PiperTtsAdapter extends OpenAiCompatibleLocalTtsAdapter {
  protected readonly configuration = {
    provider: 'local-piper',
    model: 'en_US-amy-low',
    defaultVoice: 'en_US-amy-low',
    urlConfigKey: 'TTS_LOCAL_PIPER_EN_US_AMY_URL',
    voiceConfigKey: 'TTS_LOCAL_PIPER_EN_US_AMY_VOICE',
  };

  constructor(configService: ConfigService) {
    super(configService);
  }
}

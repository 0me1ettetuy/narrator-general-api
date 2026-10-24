import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAiCompatibleLocalTtsAdapter } from './openai-compatible-local-tts.adapter.js';

@Injectable()
export class KokoroTtsAdapter extends OpenAiCompatibleLocalTtsAdapter {
  protected readonly configuration = {
    provider: 'local-kokoro',
    model: 'kokoro',
    defaultVoice: 'af_heart',
    urlConfigKey: 'TTS_LOCAL_KOKORO_82M_URL',
    voiceConfigKey: 'TTS_LOCAL_KOKORO_82M_VOICE',
  };

  constructor(configService: ConfigService) {
    super(configService);
  }
}

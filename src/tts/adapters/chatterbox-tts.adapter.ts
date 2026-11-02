// Local TTS models are disabled; see docs/tts/local-tts-models-removed.md
// for the full restoration record. The body below is commented out, not
// deleted, so restoring is: delete this header and the /* */ wrapper.
/*
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAiCompatibleLocalTtsAdapter } from './openai-compatible-local-tts.adapter.js';

@Injectable()
export class ChatterboxTtsAdapter extends OpenAiCompatibleLocalTtsAdapter {
  protected readonly configuration = {
    provider: 'local-chatterbox',
    model: 'chatterbox-turbo',
    defaultVoice: 'default',
    urlConfigKey: 'TTS_LOCAL_CHATTERBOX_TURBO_URL',
    voiceConfigKey: 'TTS_LOCAL_CHATTERBOX_TURBO_VOICE',
  };

  constructor(configService: ConfigService) {
    super(configService);
  }
}

*/

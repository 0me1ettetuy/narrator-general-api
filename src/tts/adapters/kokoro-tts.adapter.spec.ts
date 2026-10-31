import type { ConfigService } from '@nestjs/config';
import { KokoroTtsAdapter } from './kokoro-tts.adapter.js';
import { TtsSynthesisError } from './tts-adapter.js';

describe('KokoroTtsAdapter', () => {
  it('does not try to narrate Russian text with an English Kokoro voice', async () => {
    const adapter = new KokoroTtsAdapter({
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          TTS_LOCAL_KOKORO_82M_URL: 'http://localhost:7860',
        };

        return values[key];
      }),
    } as unknown as ConfigService);

    await expect(
      adapter.synthesizeStream({ text: 'Привет, мир.', language: 'ru' }),
    ).rejects.toEqual(
      new TtsSynthesisError('Kokoro-82M does not include a Russian voice'),
    );
  });
});

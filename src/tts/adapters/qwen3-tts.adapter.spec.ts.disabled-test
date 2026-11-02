import type { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import { Qwen3TtsAdapter } from './qwen3-tts.adapter.js';

async function readStream(stream: Readable): Promise<Uint8Array> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return new Uint8Array(Buffer.concat(chunks));
}

describe('Qwen3TtsAdapter', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }),
    );
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('maps an EPUB BCP 47 language to the Qwen request language', async () => {
    const adapter = createAdapter();

    const result = await adapter.synthesizeStream({
      text: 'Привет, мир.',
      language: 'ru-RU',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8001/v1/audio/speech',
      expect.objectContaining({
        body: JSON.stringify({
          model: 'tts-1',
          input: 'Привет, мир.',
          voice: 'ryan',
          response_format: 'mp3',
          language: 'Russian',
        }),
      }),
    );
    await expect(readStream(result.stream)).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it('uses Qwen auto-detection when the EPUB has no supported language', async () => {
    const adapter = createAdapter();

    const result = await adapter.synthesizeStream({
      text: 'Hello world.',
      language: 'ar',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8001/v1/audio/speech',
      expect.objectContaining({
        body: expect.stringContaining('"language":"Auto"'),
      }),
    );
    await expect(readStream(result.stream)).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  function createAdapter(): Qwen3TtsAdapter {
    return new Qwen3TtsAdapter({
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          TTS_LOCAL_QWEN3_TTS_0_6B_URL: 'http://localhost:8001',
          TTS_LOCAL_QWEN3_TTS_0_6B_VOICE: 'ryan',
        };

        return values[key];
      }),
    } as unknown as ConfigService);
  }
});

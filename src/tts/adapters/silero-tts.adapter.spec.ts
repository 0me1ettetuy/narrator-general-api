import type { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import { SileroTtsAdapter } from './silero-tts.adapter.js';
import { TtsSynthesisError } from './tts-adapter.js';

async function readStream(stream: Readable): Promise<Uint8Array> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return new Uint8Array(Buffer.concat(chunks));
}

describe('SileroTtsAdapter', () => {
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

  it('maps an EPUB BCP 47 language to the Silero request language', async () => {
    const adapter = createAdapter();

    const result = await adapter.synthesizeStream({
      text: 'Привет, мир.',
      language: 'ru-RU',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8001/v1/audio/speech',
      expect.objectContaining({
        body: JSON.stringify({
          model: 'silero',
          input: 'Привет, мир.',
          voice: 'auto',
          response_format: 'mp3',
          language: 'Russian',
        }),
      }),
    );
    await expect(readStream(result.stream)).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it('sends the chapter voice when one is set, otherwise "auto"', async () => {
    const adapter = createAdapter();
    // A Response body can be read once, so each call needs its own.
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(new Uint8Array([1]), {
          status: 200,
          headers: { 'content-type': 'audio/mpeg' },
        }),
      ),
    );

    await adapter.synthesizeStream({
      text: 'Привет.',
      language: 'ru',
      voiceId: 'baya',
    });
    await adapter.synthesizeStream({ text: 'Привет.', language: 'ru' });

    expect(fetchMock.mock.calls[0][1].body).toContain('"voice":"baya"');
    expect(fetchMock.mock.calls[1][1].body).toContain('"voice":"auto"');
  });

  it('rejects a language Silero does not support, without calling the server', async () => {
    const adapter = createAdapter();

    await expect(
      adapter.synthesizeStream({ text: 'Привіт.', language: 'uk' }),
    ).rejects.toThrow(TtsSynthesisError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a book without a language instead of guessing one', async () => {
    const adapter = createAdapter();

    await expect(
      adapter.synthesizeStream({ text: 'Hello world.', language: null }),
    ).rejects.toThrow(TtsSynthesisError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  function createAdapter(): SileroTtsAdapter {
    return new SileroTtsAdapter({
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          TTS_LOCAL_SILERO_TTS_URL: 'http://localhost:8001',
        };

        return values[key];
      }),
    } as unknown as ConfigService);
  }
});

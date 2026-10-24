import type { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import { PiperTtsAdapter } from './piper-tts.adapter.js';

async function readStream(stream: Readable): Promise<Uint8Array> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return new Uint8Array(Buffer.concat(chunks));
}

describe('OpenAiCompatibleLocalTtsAdapter', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('sends a Piper-compatible MP3 request and exposes its response stream', async () => {
    const audio = new Uint8Array([1, 2, 3]);
    fetchMock.mockResolvedValue(
      new Response(audio, {
        status: 200,
        headers: {
          'content-type': 'audio/mpeg',
          'content-length': String(audio.byteLength),
          'x-request-id': 'local-request-123',
        },
      }),
    );
    const adapter = new PiperTtsAdapter({
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          TTS_LOCAL_PIPER_EN_US_AMY_URL: 'http://localhost:9500',
          TTS_LOCAL_PIPER_EN_US_AMY_VOICE: 'en_US-amy-low',
        };

        return values[key];
      }),
    } as unknown as ConfigService);

    const result = await adapter.synthesizeStream({ text: ' Hello world. ' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:9500/v1/audio/speech',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'en_US-amy-low',
          input: 'Hello world.',
          voice: 'en_US-amy-low',
          response_format: 'mp3',
        }),
        signal: expect.any(AbortSignal),
      }),
    );
    await expect(readStream(result.stream)).resolves.toEqual(audio);
    expect({
      provider: result.provider,
      model: result.model,
      voice: result.voice,
      generationId: result.generationId,
      byteSize: result.getByteSize(),
    }).toEqual({
      provider: 'local-piper',
      model: 'en_US-amy-low',
      voice: 'en_US-amy-low',
      generationId: 'local-request-123',
      byteSize: audio.byteLength,
    });
  });
});

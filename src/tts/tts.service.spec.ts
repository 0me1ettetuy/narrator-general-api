import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import { TtsService, TtsSynthesisError } from './tts.service.js';

async function readStream(stream: Readable): Promise<Uint8Array> {
  const parts: Buffer[] = [];

  for await (const part of stream) {
    parts.push(Buffer.from(part));
  }

  return new Uint8Array(Buffer.concat(parts));
}

describe('TtsService', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  const configValues = {
    FISH_AUDIO_API_KEY: 'test-fish-audio-key',
    VOICE_ID: 'test-voice-id',
  };

  let service: TtsService;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    service = new TtsService({
      get: jest.fn((key: keyof typeof configValues) => configValues[key]),
    } as unknown as ConfigService);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('sends the configured model and voice, then exposes a validated MP3 stream', async () => {
    const audio = new Uint8Array([1, 2, 3]);
    fetchMock.mockResolvedValue(
      new Response(audio, {
        status: 200,
        headers: {
          'content-type': 'audio/mpeg',
          'content-length': String(audio.byteLength),
          'x-request-id': 'request-123',
        },
      }),
    );

    const result = await service.synthesizeStream({ text: ' Hello world. ' });

    expect({
      mimeType: result.mimeType,
      provider: result.provider,
      model: result.model,
      voice: result.voice,
      generationId: result.generationId,
      byteSize: result.getByteSize(),
    }).toEqual({
      mimeType: 'audio/mpeg',
      provider: 'fish-audio',
      model: 's2.1-pro-free',
      voice: 'test-voice-id',
      generationId: 'request-123',
      byteSize: 0,
    });

    await expect(readStream(result.stream)).resolves.toEqual(audio);
    expect(result.getByteSize()).toBe(audio.byteLength);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.fish.audio/v1/tts',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-fish-audio-key',
          'Content-Type': 'application/json',
          model: 's2.1-pro-free',
        },
        body: JSON.stringify({
          text: 'Hello world.',
          reference_id: 'test-voice-id',
          format: 'mp3',
        }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('rejects a provider error without reading its body', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'provider detail' }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(
      service.synthesizeStream({ text: 'Hello world.' }),
    ).rejects.toEqual(
      new TtsSynthesisError('TTS provider request failed with status 429'),
    );
  });

  it('rejects an unexpected response content type', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'not audio' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(
      service.synthesizeStream({ text: 'Hello world.' }),
    ).rejects.toThrow('TTS provider returned an unexpected format');
  });

  it('rejects an empty chunked MP3 response while it is streamed', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'audio/mpeg' },
        },
      ),
    );

    const result = await service.synthesizeStream({ text: 'Hello world.' });

    await expect(readStream(result.stream)).rejects.toThrow(
      'TTS provider returned an empty audio file',
    );
  });

  it('rejects empty input before making a provider request', async () => {
    await expect(service.synthesizeStream({ text: '   ' })).rejects.toThrow(
      'TTS input must not be empty',
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

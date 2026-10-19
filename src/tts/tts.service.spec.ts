import { ConfigService } from '@nestjs/config';
import { TtsService, TtsSynthesisError } from './tts.service.js';

describe('TtsService', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  const configValues = {
    OPENROUTER_API_KEY: 'test-openrouter-key',
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

  it('sends the configured model and voice, then returns validated MP3 bytes', async () => {
    const audio = new Uint8Array([1, 2, 3]);
    fetchMock.mockResolvedValue(
      new Response(audio, {
        status: 200,
        headers: {
          'content-type': 'audio/mpeg',
          'content-length': String(audio.byteLength),
          'x-generation-id': 'generation-123',
        },
      }),
    );

    await expect(
      service.synthesize({ text: ' Hello world. ' }),
    ).resolves.toEqual({
      bytes: audio,
      mimeType: 'audio/mpeg',
      provider: 'openrouter',
      model: 'fish-audio/s2.1-pro-free:free',
      voice: 'test-voice-id',
      generationId: 'generation-123',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/audio/speech',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-openrouter-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'fish-audio/s2.1-pro-free:free',
          voice: 'test-voice-id',
          input: 'Hello world.',
          response_format: 'mp3',
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

    await expect(service.synthesize({ text: 'Hello world.' })).rejects.toEqual(
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

    await expect(service.synthesize({ text: 'Hello world.' })).rejects.toThrow(
      'TTS provider returned an unexpected format',
    );
  });

  it('rejects empty input before making a provider request', async () => {
    await expect(service.synthesize({ text: '   ' })).rejects.toThrow(
      'TTS input must not be empty',
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

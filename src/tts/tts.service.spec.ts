import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import type { FishCredentialService } from '../tts-models/fish-credential.service.js';
import type { FishVoiceService } from '../tts-models/fish-voice.service.js';

jest.mock('../tts-models/fish-credential.service.js', () => ({
  FishCredentialService: class FishCredentialService {},
}));
jest.mock('../tts-models/fish-voice.service.js', () => ({
  FishVoiceService: class FishVoiceService {},
}));

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
  const fishCredentials = {
    getValidApiKey: jest.fn().mockResolvedValue('test-fish-audio-key'),
    markInvalid: jest.fn().mockResolvedValue(undefined),
  } as unknown as FishCredentialService;
  const fishVoices = {
    resolveVoiceReferenceId: jest.fn().mockResolvedValue('user-voice-id'),
  } as unknown as FishVoiceService;

  let service: TtsService;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    service = new TtsService(
      {
        get: jest.fn(),
      } as unknown as ConfigService,
      fishCredentials,
      fishVoices,
    );
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('uses the owning user key and selected Fish model', async () => {
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

    const result = await service.synthesizeStream({
      text: ' Hello world. ',
      userId: 'user-id',
      providerModel: 's2.1-pro-free',
    });

    expect(fishCredentials.getValidApiKey).toHaveBeenCalledWith('user-id');
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
      voice: 'user-voice-id',
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
          reference_id: 'user-voice-id',
          format: 'mp3',
        }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('marks the stored key invalid after a Fish authentication failure', async () => {
    fetchMock.mockResolvedValue(
      new Response('{}', {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(
      service.synthesizeStream({ text: 'Hello world.', userId: 'user-id' }),
    ).rejects.toEqual(
      new TtsSynthesisError('TTS provider request failed with status 401'),
    );
    expect(fishCredentials.markInvalid).toHaveBeenCalledWith('user-id');
  });

  it('uses the configured default voice when the user has no voice ID', async () => {
    fishVoices.resolveVoiceReferenceId.mockResolvedValueOnce('sarah-voice-id');
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }),
    );
    service = new TtsService(
      {
        get: jest.fn(),
      } as unknown as ConfigService,
      fishCredentials,
      fishVoices,
    );

    const result = await service.synthesizeStream({
      text: 'Hello world.',
      userId: 'user-id',
    });

    expect(result.voice).toBe('sarah-voice-id');
    await expect(readStream(result.stream)).resolves.toEqual(
      new Uint8Array([1]),
    );
  });

  it('uses a chapter voice snapshot before the current user selection', async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }),
    );

    const result = await service.synthesizeStream({
      text: 'Hello world.',
      userId: 'user-id',
      voiceId: 'chapter-voice-snapshot',
    });

    expect(result.voice).toBe('chapter-voice-snapshot');
    expect(fishVoices.resolveVoiceReferenceId).not.toHaveBeenCalled();
    await expect(readStream(result.stream)).resolves.toEqual(
      new Uint8Array([1]),
    );
  });

  it('uses the Fish provider default when no voice is configured', async () => {
    fishVoices.resolveVoiceReferenceId.mockResolvedValueOnce(null);
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }),
    );
    service = new TtsService(
      {
        get: jest.fn(),
      } as unknown as ConfigService,
      fishCredentials,
      fishVoices,
    );

    const result = await service.synthesizeStream({
      text: 'Hello world.',
      userId: 'user-id',
    });

    expect(result.voice).toBe('default');
    await expect(readStream(result.stream)).resolves.toEqual(
      new Uint8Array([1]),
    );
  });

  it('rejects empty input before reading a user credential', async () => {
    await expect(service.synthesizeStream({ text: '   ' })).rejects.toThrow(
      'TTS input must not be empty',
    );

    expect(fishCredentials.getValidApiKey).not.toHaveBeenCalled();
  });
});

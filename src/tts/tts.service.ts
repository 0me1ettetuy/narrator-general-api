import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable, Transform } from 'node:stream';
import { DEFAULT_TTS_SEGMENT_MAX_CHARACTERS } from './chapter-segmenter.js';

const FISH_AUDIO_TTS_URL = 'https://api.fish.audio/v1/tts';
const DEFAULT_FISH_TTS_MODEL = 's2.1-pro-free';
const DEFAULT_TTS_IDLE_TIMEOUT_MS = 300_000;
const MAX_TTS_AUDIO_BYTES = 20 * 1024 * 1024;
const MP3_CONTENT_TYPE = 'audio/mpeg';

export type TtsSynthesisInput = {
  text: string;
};

export type TtsSynthesisStream = {
  stream: Readable;
  mimeType: typeof MP3_CONTENT_TYPE;
  provider: 'fish-audio';
  model: string;
  voice: string;
  generationId: string | null;
  getByteSize: () => number;
  abort: () => void;
};

export class TtsSynthesisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = TtsSynthesisError.name;
  }
}

@Injectable()
export class TtsService {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly voice: string;
  private readonly idleTimeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.getRequiredConfig('FISH_AUDIO_API_KEY');
    this.voice = this.getRequiredConfig('VOICE_ID');
    this.model =
      this.configService.get<string>('FISH_TTS_MODEL') ??
      DEFAULT_FISH_TTS_MODEL;
    this.idleTimeoutMs = this.getPositiveNumberConfig(
      'FISH_TTS_IDLE_TIMEOUT_MS',
      DEFAULT_TTS_IDLE_TIMEOUT_MS,
    );
  }

  async synthesizeStream(
    input: TtsSynthesisInput,
  ): Promise<TtsSynthesisStream> {
    const text = input.text.trim();

    if (!text) {
      throw new TtsSynthesisError('TTS input must not be empty');
    }

    if (text.length > DEFAULT_TTS_SEGMENT_MAX_CHARACTERS) {
      throw new TtsSynthesisError('TTS input exceeds the allowed size');
    }

    const { response, controller, clearTimeout } =
      await this.requestAudio(text);

    try {
      this.assertSuccessfulMp3Response(response);

      if (!response.body) {
        throw new TtsSynthesisError(
          'TTS provider returned an empty audio file',
        );
      }

      clearTimeout();
      const audioStream = this.createAudioStream(response.body, controller);

      return {
        ...audioStream,
        mimeType: MP3_CONTENT_TYPE,
        provider: 'fish-audio',
        model: this.model,
        voice: this.voice,
        generationId: response.headers.get('x-request-id'),
      };
    } catch (error) {
      if (error instanceof TtsSynthesisError) {
        throw error;
      }

      if (controller.signal.aborted) {
        throw new TtsSynthesisError('TTS provider stream became idle');
      }

      throw new TtsSynthesisError('TTS provider response could not be read');
    } finally {
      clearTimeout();
    }
  }

  private async requestAudio(text: string): Promise<{
    response: Response;
    controller: AbortController;
    clearTimeout: () => void;
  }> {
    const controller = new AbortController();
    const timeout = this.startIdleTimeout(controller);

    try {
      const response = await fetch(FISH_AUDIO_TTS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          model: this.model,
        },
        body: JSON.stringify({
          text,
          reference_id: this.voice,
          format: 'mp3',
        }),
        signal: controller.signal,
      });

      return {
        response,
        controller,
        clearTimeout: () => clearTimeout(timeout),
      };
    } catch (error) {
      clearTimeout(timeout);

      if (controller.signal.aborted) {
        throw new TtsSynthesisError('TTS provider did not start responding');
      }

      throw new TtsSynthesisError('TTS provider request failed');
    }
  }

  private startIdleTimeout(
    controller: AbortController,
  ): ReturnType<typeof setTimeout> {
    return setTimeout(() => controller.abort(), this.idleTimeoutMs);
  }

  private createAudioStream(
    body: ReadableStream<Uint8Array>,
    controller: AbortController,
  ): Pick<TtsSynthesisStream, 'stream' | 'getByteSize' | 'abort'> {
    let byteSize = 0;
    let idleTimeout = this.startIdleTimeout(controller);
    const source = Readable.fromWeb(
      body as unknown as Parameters<typeof Readable.fromWeb>[0],
    );
    const stream = new Transform({
      transform: (chunk, _encoding, callback) => {
        const chunkByteSize = Buffer.byteLength(chunk);

        if (chunkByteSize > 0) {
          clearTimeout(idleTimeout);
          idleTimeout = this.startIdleTimeout(controller);
          byteSize += chunkByteSize;
        }

        if (byteSize > MAX_TTS_AUDIO_BYTES) {
          controller.abort();
          callback(
            new TtsSynthesisError(
              'TTS provider audio exceeds the allowed size',
            ),
          );
          return;
        }

        callback(null, chunk);
      },
      flush: (callback) => {
        if (!byteSize) {
          callback(
            new TtsSynthesisError('TTS provider returned an empty audio file'),
          );
          return;
        }

        callback();
      },
    });

    const clearIdleTimeout = () => clearTimeout(idleTimeout);

    source.once('error', (error) => stream.destroy(error));
    stream.once('close', clearIdleTimeout);
    stream.once('end', clearIdleTimeout);
    stream.once('error', clearIdleTimeout);
    source.pipe(stream);

    return {
      stream,
      getByteSize: () => byteSize,
      abort: () => {
        controller.abort();
        source.destroy();
        stream.destroy();
      },
    };
  }

  private assertSuccessfulMp3Response(response: Response): void {
    if (!response.ok) {
      throw new TtsSynthesisError(
        `TTS provider request failed with status ${response.status}`,
      );
    }

    const contentType = response.headers.get('content-type')?.toLowerCase();

    if (!contentType?.startsWith(MP3_CONTENT_TYPE)) {
      throw new TtsSynthesisError('TTS provider returned an unexpected format');
    }

    const contentLength = response.headers.get('content-length');

    if (!contentLength) {
      return;
    }

    const declaredByteSize = Number(contentLength);

    if (
      !Number.isSafeInteger(declaredByteSize) ||
      declaredByteSize < 1 ||
      declaredByteSize > MAX_TTS_AUDIO_BYTES
    ) {
      throw new TtsSynthesisError(
        'TTS provider audio exceeds the allowed size',
      );
    }
  }

  private getRequiredConfig(key: string): string {
    const value = this.configService.get<string>(key);

    if (!value) {
      throw new Error(`${key} is required`);
    }

    return value;
  }

  private getPositiveNumberConfig(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);

    if (!value) {
      return fallback;
    }

    const parsed = Number(value);

    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}

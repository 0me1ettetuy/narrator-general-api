import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_TTS_SEGMENT_MAX_CHARACTERS } from './chapter-segmenter.js';

const OPENROUTER_TTS_URL = 'https://openrouter.ai/api/v1/audio/speech';
const DEFAULT_OPENROUTER_TTS_MODEL = 'fish-audio/s2.1-pro-free:free';
const DEFAULT_TTS_TIMEOUT_MS = 60_000;
const MAX_TTS_AUDIO_BYTES = 20 * 1024 * 1024;
const MP3_CONTENT_TYPE = 'audio/mpeg';

export type TtsSynthesisInput = {
  text: string;
};

export type TtsSynthesisResult = {
  bytes: Uint8Array;
  mimeType: typeof MP3_CONTENT_TYPE;
  provider: 'openrouter';
  model: string;
  voice: string;
  generationId: string | null;
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
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.getRequiredConfig('OPENROUTER_API_KEY');
    this.voice = this.getRequiredConfig('VOICE_ID');
    this.model =
      this.configService.get<string>('OPENROUTER_TTS_MODEL') ??
      DEFAULT_OPENROUTER_TTS_MODEL;
    this.timeoutMs = this.getPositiveNumberConfig(
      'OPENROUTER_TTS_TIMEOUT_MS',
      DEFAULT_TTS_TIMEOUT_MS,
    );
  }

  async synthesize(input: TtsSynthesisInput): Promise<TtsSynthesisResult> {
    const text = input.text.trim();

    if (!text) {
      throw new TtsSynthesisError('TTS input must not be empty');
    }

    if (text.length > DEFAULT_TTS_SEGMENT_MAX_CHARACTERS) {
      throw new TtsSynthesisError('TTS input exceeds the allowed size');
    }

    const response = await this.requestAudio(text);
    this.assertSuccessfulMp3Response(response);

    const bytes = new Uint8Array(await response.arrayBuffer());

    if (!bytes.byteLength) {
      throw new TtsSynthesisError('TTS provider returned an empty audio file');
    }

    if (bytes.byteLength > MAX_TTS_AUDIO_BYTES) {
      throw new TtsSynthesisError(
        'TTS provider audio exceeds the allowed size',
      );
    }

    return {
      bytes,
      mimeType: MP3_CONTENT_TYPE,
      provider: 'openrouter',
      model: this.model,
      voice: this.voice,
      generationId: response.headers.get('x-generation-id'),
    };
  }

  private async requestAudio(text: string): Promise<Response> {
    try {
      return await fetch(OPENROUTER_TTS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          voice: this.voice,
          input: text,
          response_format: 'mp3',
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new TtsSynthesisError('TTS provider request failed');
    }
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

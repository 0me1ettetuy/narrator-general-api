import { ConfigService } from '@nestjs/config';
import { DEFAULT_TTS_SEGMENT_MAX_CHARACTERS } from '../chapter-segmenter.js';
import {
  type TtsAdapter,
  type TtsSynthesisInput,
  type TtsSynthesisStream,
  TtsSynthesisError,
} from './tts-adapter.js';
import {
  assertSuccessfulMp3Response,
  createTtsAudioStream,
  startIdleTimeout,
} from './tts-audio-stream.js';

const DEFAULT_LOCAL_TTS_IDLE_TIMEOUT_MS = 300_000;

type LocalTtsAdapterConfiguration = {
  provider: string;
  model: string;
  defaultVoice: string;
  urlConfigKey: string;
  voiceConfigKey: string;
};

export abstract class OpenAiCompatibleLocalTtsAdapter implements TtsAdapter {
  protected abstract readonly configuration: LocalTtsAdapterConfiguration;

  constructor(private readonly configService: ConfigService) {}

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

    const controller = new AbortController();
    const idleTimeoutMs = this.getPositiveNumberConfig(
      'TTS_LOCAL_TTS_IDLE_TIMEOUT_MS',
      DEFAULT_LOCAL_TTS_IDLE_TIMEOUT_MS,
    );
    const timeout = startIdleTimeout(controller, idleTimeoutMs);
    const voice = this.getVoice(input);

    try {
      const response = await fetch(this.getSynthesisUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.configuration.model,
          input: text,
          voice,
          response_format: 'mp3',
          ...this.getProviderRequestFields(input),
        }),
        signal: controller.signal,
      });

      assertSuccessfulMp3Response(response);

      if (!response.body) {
        throw new TtsSynthesisError(
          'TTS provider returned an empty audio file',
        );
      }

      clearTimeout(timeout);

      return {
        ...createTtsAudioStream(response.body, controller, idleTimeoutMs),
        mimeType: 'audio/mpeg',
        provider: this.configuration.provider,
        model: this.configuration.model,
        voice,
        generationId: response.headers.get('x-request-id'),
      };
    } catch (error) {
      if (error instanceof TtsSynthesisError) {
        throw error;
      }

      if (controller.signal.aborted) {
        throw new TtsSynthesisError('TTS provider did not start responding');
      }

      throw new TtsSynthesisError('TTS provider request failed');
    } finally {
      clearTimeout(timeout);
    }
  }

  private getSynthesisUrl(): string {
    const baseUrl = this.configService
      .get<string>(this.configuration.urlConfigKey)
      ?.trim();

    if (!baseUrl) {
      throw new TtsSynthesisError(
        `${this.configuration.urlConfigKey} is required for local TTS`,
      );
    }

    try {
      const url = new URL(baseUrl);

      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('Local TTS URL must use HTTP');
      }

      return new URL('/v1/audio/speech', url).toString();
    } catch {
      throw new TtsSynthesisError(
        `${this.configuration.urlConfigKey} must be a valid HTTP URL`,
      );
    }
  }

  /**
   * Local engines share the OpenAI-compatible base payload but may expose
   * additional, provider-specific fields. Keep those fields in the concrete
   * adapter so a Qwen option cannot accidentally be sent to Piper, Kokoro, or
   * Chatterbox.
   */
  protected getProviderRequestFields(
    _input: TtsSynthesisInput,
  ): Record<string, string> {
    return {};
  }

  protected getVoice(_input: TtsSynthesisInput): string {
    return (
      this.configService
        .get<string>(this.configuration.voiceConfigKey)
        ?.trim() || this.configuration.defaultVoice
    );
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

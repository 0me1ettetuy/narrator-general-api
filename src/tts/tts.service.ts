import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FishCredentialService } from '../tts-models/fish-credential.service.js';
import { FishVoiceService } from '../tts-models/fish-voice.service.js';
import { DEFAULT_TTS_SEGMENT_MAX_CHARACTERS } from './chapter-segmenter.js';
import {
  type TtsAdapter,
  type TtsSynthesisInput,
  type TtsSynthesisStream,
  TtsSynthesisError,
} from './adapters/tts-adapter.js';
import {
  assertSuccessfulMp3Response,
  createTtsAudioStream,
  startIdleTimeout,
} from './adapters/tts-audio-stream.js';

export {
  TtsSynthesisError,
  type TtsSynthesisInput,
  type TtsSynthesisStream,
} from './adapters/tts-adapter.js';

const FISH_AUDIO_TTS_URL = 'https://api.fish.audio/v1/tts';
const DEFAULT_FISH_TTS_MODEL = 's2.1-pro-free';
const DEFAULT_TTS_IDLE_TIMEOUT_MS = 300_000;
const RETRYABLE_FISH_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_FISH_RETRIES = 4;
const FIRST_FISH_RETRY_DELAY_MS = 2_000;
const MAX_FISH_RETRY_DELAY_MS = 60_000;

@Injectable()
export class TtsService implements TtsAdapter {
  private readonly idleTimeoutMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly fishCredentials: FishCredentialService,
    private readonly fishVoices: FishVoiceService,
  ) {
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

    if (!input.userId) {
      throw new TtsSynthesisError('Fish Audio requires an authenticated user');
    }

    const configuration = await this.getConfiguration(
      input.userId,
      input.providerModel,
      input.voiceId,
    );
    const { response, controller, clearTimeout } =
      await this.requestAudioWithRetries(text, input.userId, configuration);

    try {
      assertSuccessfulMp3Response(response);

      if (!response.body) {
        throw new TtsSynthesisError(
          'TTS provider returned an empty audio file',
        );
      }

      clearTimeout();
      const audioStream = createTtsAudioStream(
        response.body,
        controller,
        this.idleTimeoutMs,
      );

      return {
        ...audioStream,
        mimeType: 'audio/mpeg',
        provider: 'fish-audio',
        model: configuration.model,
        voice: configuration.voice,
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

  // Retried here so throttling cannot exhaust a chapter's job attempts in seconds.
  private async requestAudioWithRetries(
    text: string,
    userId: string,
    configuration: { apiKey: string; model: string; voice: string },
  ): ReturnType<TtsService['requestAudio']> {
    for (let retry = 0; ; retry += 1) {
      const request = await this.requestAudio(text, userId, configuration);

      if (
        !RETRYABLE_FISH_STATUSES.has(request.response.status) ||
        retry >= MAX_FISH_RETRIES
      ) {
        return request;
      }

      request.clearTimeout();
      request.controller.abort();
      await wait(getRetryDelayMs(request.response, retry));
    }
  }

  private async requestAudio(
    text: string,
    userId: string,
    configuration: { apiKey: string; model: string; voice: string },
  ): Promise<{
    response: Response;
    controller: AbortController;
    clearTimeout: () => void;
  }> {
    const controller = new AbortController();
    const timeout = startIdleTimeout(controller, this.idleTimeoutMs);

    try {
      const response = await fetch(FISH_AUDIO_TTS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${configuration.apiKey}`,
          'Content-Type': 'application/json',
          model: configuration.model,
        },
        body: JSON.stringify({
          text,
          reference_id: configuration.voice,
          format: 'mp3',
        }),
        signal: controller.signal,
      });

      if (response.status === 401) {
        await this.fishCredentials.markInvalid(userId);
      }

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

  private async getConfiguration(
    userId: string,
    providerModel: string | null | undefined,
    voiceId: string | null | undefined,
  ): Promise<{
    apiKey: string;
    model: string;
    voice: string;
  }> {
    return {
      apiKey: await this.fishCredentials.getValidApiKey(userId),
      model: providerModel ?? DEFAULT_FISH_TTS_MODEL,
      voice:
        voiceId?.trim() ||
        (await this.fishVoices.resolveVoiceReferenceId(userId)).trim(),
    };
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

function getRetryDelayMs(response: Response, retry: number): number {
  const retryAfter = response.headers.get('retry-after');
  const seconds = Number(retryAfter);
  const requestedMs = retryAfter
    ? Number.isFinite(seconds)
      ? seconds * 1_000
      : Date.parse(retryAfter) - Date.now()
    : Number.NaN;
  const delayMs =
    Number.isFinite(requestedMs) && requestedMs >= 0
      ? requestedMs
      : FIRST_FISH_RETRY_DELAY_MS * 2 ** retry;

  return Math.min(delayMs, MAX_FISH_RETRY_DELAY_MS);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

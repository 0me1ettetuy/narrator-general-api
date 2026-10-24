import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ConfiguredLocalTtsModel,
  LocalTtsModelAvailability,
} from './types/tts-model.type.js';

const DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 2_000;
const DEFAULT_HEALTH_CACHE_TTL_MS = 15_000;

type CachedAvailability = {
  availability: LocalTtsModelAvailability;
  expiresAt: number;
};

@Injectable()
export class TtsModelAvailabilityService {
  private readonly healthCheckTimeoutMs: number;
  private readonly healthCacheTtlMs: number;
  private readonly cache = new Map<string, CachedAvailability>();

  constructor(private readonly configService: ConfigService) {
    this.healthCheckTimeoutMs = this.getPositiveNumberConfig(
      'TTS_MODEL_HEALTH_CHECK_TIMEOUT_MS',
      DEFAULT_HEALTH_CHECK_TIMEOUT_MS,
    );
    this.healthCacheTtlMs = this.getPositiveNumberConfig(
      'TTS_MODEL_HEALTH_CACHE_TTL_MS',
      DEFAULT_HEALTH_CACHE_TTL_MS,
    );
  }

  async getLocalModelAvailability(
    model: ConfiguredLocalTtsModel,
  ): Promise<LocalTtsModelAvailability> {
    if (!model.enabled || !model.healthUrl) {
      return {
        status: 'DISABLED',
        selectable: false,
        reasonCode: 'MODEL_DISABLED',
      };
    }

    const cached = this.cache.get(model.id);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.availability;
    }

    const availability = await this.checkHealth(model);

    this.cache.set(model.id, {
      availability,
      expiresAt: Date.now() + this.healthCacheTtlMs,
    });

    return availability;
  }

  private async checkHealth(
    model: ConfiguredLocalTtsModel,
  ): Promise<LocalTtsModelAvailability> {
    if (!model.healthUrl) {
      return {
        status: 'DISABLED',
        selectable: false,
        reasonCode: 'MODEL_DISABLED',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.healthCheckTimeoutMs,
    );

    try {
      const response = await fetch(model.healthUrl, {
        method: 'GET',
        signal: controller.signal,
      });

      if (response.ok && (await this.isReadyResponse(response, model))) {
        return {
          status: 'READY',
          selectable: true,
          reasonCode: null,
        };
      }
    } catch {
      // Local service failures are intentionally exposed as one safe status.
    } finally {
      clearTimeout(timeout);
    }

    return {
      status: 'UNAVAILABLE',
      selectable: false,
      reasonCode: 'MODEL_SERVICE_UNREACHABLE',
    };
  }

  private async isReadyResponse(
    response: Response,
    model: ConfiguredLocalTtsModel,
  ): Promise<boolean> {
    if (model.healthStrategy === 'HTTP_OK') {
      return true;
    }

    try {
      const body: unknown = await response.json();

      return (
        typeof body === 'object' &&
        body !== null &&
        'status' in body &&
        body.status === 'ready'
      );
    } catch {
      return false;
    }
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

import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { API_ERROR_CODES } from '../global-filters/api-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { temporalNow, type Instant } from '../prisma/temporal.js';
import type {
  FishCredentialResponse,
  FishVoiceResponse,
} from './contracts/tts-models.response.js';
import { FishVoiceService } from './fish-voice.service.js';
import type { FishCredentialState } from './types/tts-model.type.js';

const FISH_AUDIO_PROVIDER = 'FISH_AUDIO';
const FISH_AUDIO_API_BASE_URL = 'https://api.fish.audio';
const CIPHER_VERSION = 'v1';
const ENCRYPTION_KEY_VERSION = 1;
const AES_256_GCM = 'aes-256-gcm';
const DEFAULT_VALIDATION_TIMEOUT_MS = 5_000;
const CREDIT_CACHE_TTL_MS = 60_000;

type StoredFishCredential = {
  id: string;
  encryptedSecret: string;
  encryptionKeyVersion: number;
  state: 'VALID' | 'INVALID' | 'UNKNOWN';
  lastValidatedAt: Instant | null;
  lastValidationError: string | null;
};

type ValidationResult = {
  state: Exclude<FishCredentialState, 'MISSING'>;
  errorCode: string | null;
};

@Injectable()
export class FishCredentialService {
  // shortcut: per-process cache, so each API instance asks Fish once a minute per user; use Redis if instances multiply.
  private readonly creditCache = new Map<
    string,
    { hasCredit: boolean | null; expiresAt: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly fishVoices: FishVoiceService,
  ) {}

  async getPublicStatus(userId: string): Promise<FishCredentialResponse> {
    const [credential, voices] = await Promise.all([
      this.findCredential(userId) as Promise<StoredFishCredential | null>,
      this.fishVoices.getVoices(userId),
    ]);

    if (!credential) {
      return this.toPublicStatus('MISSING', null, voices);
    }

    return this.toPublicStatus(
      credential.state,
      credential.lastValidatedAt,
      voices,
    );
  }

  async saveAndValidate(
    userId: string,
    apiKey: string,
  ): Promise<FishCredentialResponse> {
    const validation = await this.validateApiKey(apiKey);
    const now = temporalNow();
    const encryptedSecret = this.encrypt(userId, apiKey);
    const existing = (await this.findCredential(
      userId,
    )) as StoredFishCredential | null;
    const data = {
      encryptedSecret,
      encryptionKeyVersion: ENCRYPTION_KEY_VERSION,
      state: validation.state,
      lastValidatedAt: now,
      lastValidationError: validation.errorCode,
      updatedAt: now,
    };

    if (existing) {
      await this.prisma.db.orm.public.UserTtsProviderCredential.where({
        id: existing.id,
        userId,
        provider: FISH_AUDIO_PROVIDER,
      }).update(data);
    } else {
      await this.prisma.db.orm.public.UserTtsProviderCredential.create({
        id: randomUUID(),
        userId,
        provider: FISH_AUDIO_PROVIDER,
        ...data,
      });
    }

    this.creditCache.delete(userId);

    return this.getPublicStatus(userId);
  }

  /**
   * Whether the user's Fish account has API credit for paid models. `null`
   * means Fish could not be asked (callers must not block on that); a 402 at
   * synthesis time is the final guard.
   */
  async hasApiCredit(userId: string): Promise<boolean | null> {
    const cached = this.creditCache.get(userId);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.hasCredit;
    }

    const hasCredit = await this.fetchHasApiCredit(userId);

    this.creditCache.set(userId, {
      hasCredit,
      expiresAt: Date.now() + CREDIT_CACHE_TTL_MS,
    });

    return hasCredit;
  }

  async delete(userId: string): Promise<void> {
    this.creditCache.delete(userId);
    await this.prisma.db.orm.public.UserTtsProviderCredential.where({
      userId,
      provider: FISH_AUDIO_PROVIDER,
    }).deleteAndCount();
  }

  async assertValidCredential(userId: string): Promise<void> {
    const credential = (await this.findCredential(
      userId,
    )) as StoredFishCredential | null;

    if (!credential) {
      throw new ConflictException({
        code: API_ERROR_CODES.fishCredentialRequired,
        message: 'A Fish Audio API key is required',
      });
    }

    if (credential.state !== 'VALID') {
      throw new ConflictException({
        code: API_ERROR_CODES.fishCredentialInvalid,
        message: 'The Fish Audio API key must be validated',
      });
    }
  }

  async getValidApiKey(userId: string): Promise<string> {
    const credential = (await this.findCredential(
      userId,
    )) as StoredFishCredential | null;

    if (!credential) {
      throw new ConflictException({
        code: API_ERROR_CODES.fishCredentialRequired,
        message: 'A Fish Audio API key is required',
      });
    }

    if (credential.state !== 'VALID') {
      throw new ConflictException({
        code: API_ERROR_CODES.fishCredentialInvalid,
        message: 'The Fish Audio API key must be validated',
      });
    }

    return this.decrypt(userId, credential.encryptedSecret);
  }

  async markInvalid(userId: string): Promise<void> {
    await this.prisma.db.orm.public.UserTtsProviderCredential.where({
      userId,
      provider: FISH_AUDIO_PROVIDER,
      state: 'VALID',
    }).update({
      state: 'INVALID',
      lastValidatedAt: temporalNow(),
      lastValidationError: API_ERROR_CODES.fishCredentialInvalid,
      updatedAt: temporalNow(),
    });
  }

  private async findCredential(userId: string) {
    return this.prisma.db.orm.public.UserTtsProviderCredential.where({
      userId,
      provider: FISH_AUDIO_PROVIDER,
    }).first();
  }

  private async fetchHasApiCredit(userId: string): Promise<boolean | null> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.getPositiveNumberConfig(
        'FISH_CREDENTIAL_VALIDATION_TIMEOUT_MS',
        DEFAULT_VALIDATION_TIMEOUT_MS,
      ),
    );

    try {
      const apiKey = await this.getValidApiKey(userId);
      const response = await fetch(
        this.getWalletUrl('/wallet/self/api-credit'),
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        return null;
      }

      // Fish returns the balance as a string.
      const { credit } = (await response.json()) as { credit?: unknown };
      const balance = Number(credit);

      return typeof credit === 'string' && Number.isFinite(balance)
        ? balance > 0
        : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async validateApiKey(apiKey: string): Promise<ValidationResult> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.getPositiveNumberConfig(
        'FISH_CREDENTIAL_VALIDATION_TIMEOUT_MS',
        DEFAULT_VALIDATION_TIMEOUT_MS,
      ),
    );

    try {
      const response = await fetch(this.getWalletUrl('/wallet/self/package'), {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });

      if (response.ok) {
        return { state: 'VALID', errorCode: null };
      }

      if (response.status === 401) {
        return {
          state: 'INVALID',
          errorCode: API_ERROR_CODES.fishCredentialInvalid,
        };
      }
    } catch {
      // A network or provider failure must not be mistaken for an invalid key.
    } finally {
      clearTimeout(timeout);
    }

    return {
      state: 'UNKNOWN',
      errorCode: 'FISH_CREDENTIAL_VERIFICATION_UNAVAILABLE',
    };
  }

  private encrypt(userId: string, value: string): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv(AES_256_GCM, this.getEncryptionKey(), nonce);
    cipher.setAAD(this.getAssociatedData(userId));
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return [
      CIPHER_VERSION,
      nonce.toString('base64url'),
      tag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join('.');
  }

  private decrypt(userId: string, encryptedSecret: string): string {
    const [version, nonceValue, tagValue, ciphertext] =
      encryptedSecret.split('.');

    if (version !== CIPHER_VERSION || !nonceValue || !tagValue || !ciphertext) {
      throw new Error('Stored Fish credential is malformed');
    }

    try {
      const decipher = createDecipheriv(
        AES_256_GCM,
        this.getEncryptionKey(),
        Buffer.from(nonceValue, 'base64url'),
      );
      decipher.setAAD(this.getAssociatedData(userId));
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));

      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error('Stored Fish credential could not be decrypted');
    }
  }

  private getEncryptionKey(): Buffer {
    const configuredValue = this.configService
      .get<string>('TTS_CREDENTIAL_ENCRYPTION_KEY')
      ?.trim();

    if (!configuredValue) {
      throw new Error('TTS_CREDENTIAL_ENCRYPTION_KEY is required');
    }

    const key = Buffer.from(configuredValue, 'base64');

    if (key.byteLength !== 32 || key.toString('base64') !== configuredValue) {
      throw new Error(
        'TTS_CREDENTIAL_ENCRYPTION_KEY must be a 32-byte base64 value',
      );
    }

    return key;
  }

  private getAssociatedData(userId: string): Buffer {
    return Buffer.from(`${FISH_AUDIO_PROVIDER}:${userId}`, 'utf8');
  }

  private getWalletUrl(path: string): string {
    const baseUrl =
      this.configService.get<string>('FISH_AUDIO_API_BASE_URL')?.trim() ??
      FISH_AUDIO_API_BASE_URL;

    try {
      const url = new URL(baseUrl);

      if (url.protocol !== 'https:') {
        throw new Error('Fish Audio API URL must use HTTPS');
      }

      return new URL(path, url).toString();
    } catch {
      throw new Error('FISH_AUDIO_API_BASE_URL must be a valid HTTPS URL');
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

  private toPublicStatus(
    credentialState: FishCredentialState,
    lastValidatedAt: Instant | null,
    voices: FishVoiceResponse[],
  ): FishCredentialResponse {
    return {
      id: 'fish-audio',
      credentialState,
      setupRequired: credentialState !== 'VALID',
      lastValidatedAt,
      voices,
    };
  }
}

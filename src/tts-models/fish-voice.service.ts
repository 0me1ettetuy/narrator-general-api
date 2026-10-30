import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { API_ERROR_CODES } from '../global-filters/api-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { temporalNow, type Instant } from '../prisma/temporal.js';
import type { FishVoiceResponse } from './contracts/tts-models.response.js';

type StoredFishVoice = {
  id: string;
  catalogueKey: string;
  referenceId: string;
  name: string;
  source: 'DEFAULT' | 'CUSTOM';
  ownerUserId: string | null;
  isEnabled: boolean;
  defaultOrder: number | null;
  createdAt: Instant;
};

type LegacyFishVoice = {
  id: string;
  userId: string;
  referenceId: string;
  name: string | null;
  isSelected: boolean;
};

type UserVoicePreference = {
  selectedFishVoiceId: string | null;
};

type ConfiguredDefaultFishVoice = {
  referenceId: string;
  name: string;
  defaultOrder: number;
};

@Injectable()
export class FishVoiceService implements OnModuleInit {
  private readonly logger = new Logger(FishVoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.syncConfiguredDefaults();
    await this.migrateLegacyUserVoices();
  }

  async getVoices(userId: string): Promise<FishVoiceResponse[]> {
    const [defaults, customVoices, preference] = await Promise.all([
      this.getDefaultVoices(),
      this.getCustomVoices(userId),
      this.getUserPreference(userId),
    ]);
    const voices = [...defaults, ...customVoices];

    return voices.map((voice) =>
      this.toResponse(voice, preference?.selectedFishVoiceId === voice.id),
    );
  }

  async addVoice(
    userId: string,
    input: { referenceId: string; name?: string },
  ): Promise<FishVoiceResponse> {
    const catalogueKey = getCustomCatalogueKey(userId, input.referenceId);
    const existing = (await this.prisma.db.orm.public.FishVoice.where({
      catalogueKey,
    }).first()) as StoredFishVoice | null;

    if (existing) {
      throw new ConflictException({
        code: API_ERROR_CODES.conflict,
        message: 'Fish voice is already saved',
      });
    }

    const voice = (await this.prisma.db.orm.public.FishVoice.create({
      id: randomUUID(),
      catalogueKey,
      referenceId: input.referenceId,
      name: input.name ?? input.referenceId,
      source: 'CUSTOM',
      ownerUserId: userId,
      isEnabled: true,
      defaultOrder: null,
      updatedAt: temporalNow(),
    })) as StoredFishVoice;

    return this.toResponse(voice, false);
  }

  async selectVoice(
    userId: string,
    voiceId: string,
  ): Promise<FishVoiceResponse> {
    const voice = await this.getAccessibleVoice(userId, voiceId);

    if (!voice.isEnabled) {
      throw new ConflictException({
        code: API_ERROR_CODES.conflict,
        message: 'Fish voice is unavailable',
      });
    }

    await this.prisma.db.orm.public.User.where({ id: userId }).update({
      selectedFishVoiceId: voice.id,
      updatedAt: temporalNow(),
    });

    return this.toResponse(voice, true);
  }

  async deleteVoice(userId: string, voiceId: string): Promise<void> {
    const voice = (await this.prisma.db.orm.public.FishVoice.where({
      id: voiceId,
      source: 'CUSTOM',
      ownerUserId: userId,
    }).first()) as StoredFishVoice | null;

    if (!voice) {
      throw this.createVoiceNotFoundException();
    }

    await this.prisma.db.transaction(async (transaction) => {
      await transaction.orm.public.User.where({
        id: userId,
        selectedFishVoiceId: voice.id,
      }).update({
        selectedFishVoiceId: null,
        updatedAt: temporalNow(),
      });
      await transaction.orm.public.FishVoice.where({
        id: voice.id,
      }).deleteAndCount();
    });
  }

  async resolveVoiceReferenceId(userId: string): Promise<string | null> {
    const preference = await this.getUserPreference(userId);

    if (preference?.selectedFishVoiceId) {
      const selectedVoice = (await this.prisma.db.orm.public.FishVoice.where({
        id: preference.selectedFishVoiceId,
      }).first()) as StoredFishVoice | null;

      if (!selectedVoice || !this.isAccessibleToUser(selectedVoice, userId)) {
        throw this.createVoiceNotFoundException();
      }

      if (!selectedVoice.isEnabled) {
        throw new ConflictException({
          code: API_ERROR_CODES.conflict,
          message: 'Selected Fish voice is unavailable',
        });
      }

      return selectedVoice.referenceId;
    }

    return (
      (await this.getDefaultVoices()).find((voice) => voice.isEnabled)
        ?.referenceId ?? null
    );
  }

  private async syncConfiguredDefaults(): Promise<void> {
    const configuredVoices = this.readConfiguredDefaults();

    if (!configuredVoices) {
      return;
    }

    const existingDefaults = await this.getDefaultVoices();
    const existingByReferenceId = new Map(
      existingDefaults.map((voice) => [voice.referenceId, voice]),
    );
    const configuredReferenceIds = new Set(
      configuredVoices.map((voice) => voice.referenceId),
    );
    const now = temporalNow();

    for (const configuredVoice of configuredVoices) {
      const existing = existingByReferenceId.get(configuredVoice.referenceId);

      if (existing) {
        await this.prisma.db.orm.public.FishVoice.where({
          id: existing.id,
        }).update({
          name: configuredVoice.name,
          isEnabled: true,
          defaultOrder: configuredVoice.defaultOrder,
          updatedAt: now,
        });
        continue;
      }

      await this.prisma.db.orm.public.FishVoice.create({
        id: randomUUID(),
        catalogueKey: getDefaultCatalogueKey(configuredVoice.referenceId),
        referenceId: configuredVoice.referenceId,
        name: configuredVoice.name,
        source: 'DEFAULT',
        ownerUserId: null,
        isEnabled: true,
        defaultOrder: configuredVoice.defaultOrder,
        updatedAt: now,
      });
    }

    for (const existing of existingDefaults) {
      if (
        !configuredReferenceIds.has(existing.referenceId) &&
        existing.isEnabled
      ) {
        await this.prisma.db.orm.public.FishVoice.where({
          id: existing.id,
        }).update({
          isEnabled: false,
          defaultOrder: null,
          updatedAt: now,
        });
      }
    }
  }

  private async migrateLegacyUserVoices(): Promise<void> {
    const legacyVoices = (await this.prisma.db.orm.public.UserFishVoice.where(
      {},
    ).all()) as LegacyFishVoice[];

    for (const legacyVoice of legacyVoices) {
      const catalogueKey = getCustomCatalogueKey(
        legacyVoice.userId,
        legacyVoice.referenceId,
      );
      const existing = (await this.prisma.db.orm.public.FishVoice.where({
        catalogueKey,
      }).first()) as StoredFishVoice | null;
      const now = temporalNow();
      const voice =
        existing ??
        ((await this.prisma.db.orm.public.FishVoice.create({
          id: randomUUID(),
          catalogueKey,
          referenceId: legacyVoice.referenceId,
          name: legacyVoice.name ?? legacyVoice.referenceId,
          source: 'CUSTOM',
          ownerUserId: legacyVoice.userId,
          isEnabled: true,
          defaultOrder: null,
          updatedAt: now,
        })) as StoredFishVoice);

      if (!legacyVoice.isSelected) {
        continue;
      }

      const preference = await this.getUserPreference(legacyVoice.userId);

      if (!preference?.selectedFishVoiceId) {
        await this.prisma.db.orm.public.User.where({
          id: legacyVoice.userId,
        }).update({ selectedFishVoiceId: voice.id, updatedAt: now });
      }
    }
  }

  private readConfiguredDefaults(): ConfiguredDefaultFishVoice[] | null {
    const rawVoices = this.configService.get<string>('FISH_DEFAULT_VOICES');

    if (!rawVoices) {
      return [];
    }

    try {
      const parsed: unknown = JSON.parse(rawVoices);

      if (!Array.isArray(parsed)) {
        throw new Error('must be a JSON array');
      }

      const seenReferenceIds = new Set<string>();
      const voices = parsed.map((voice, index) => {
        if (
          !voice ||
          typeof voice !== 'object' ||
          !('id' in voice) ||
          !('name' in voice) ||
          typeof voice.id !== 'string' ||
          typeof voice.name !== 'string'
        ) {
          throw new Error('entries must contain string id and name values');
        }

        const referenceId = voice.id.trim();
        const name = voice.name.trim();

        if (!referenceId || !name || seenReferenceIds.has(referenceId)) {
          throw new Error(
            'entries must have unique non-empty id and name values',
          );
        }

        seenReferenceIds.add(referenceId);

        return { referenceId, name, defaultOrder: index };
      });

      return voices;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'invalid JSON';
      this.logger.warn(`Ignoring invalid FISH_DEFAULT_VOICES: ${reason}`);

      return null;
    }
  }

  private async getDefaultVoices(): Promise<StoredFishVoice[]> {
    const voices = (await this.prisma.db.orm.public.FishVoice.where({
      source: 'DEFAULT',
    }).all()) as StoredFishVoice[];

    return voices.sort(
      (first, second) =>
        (first.defaultOrder ?? Number.MAX_SAFE_INTEGER) -
          (second.defaultOrder ?? Number.MAX_SAFE_INTEGER) ||
        first.createdAt.epochMilliseconds - second.createdAt.epochMilliseconds,
    );
  }

  private async getCustomVoices(userId: string): Promise<StoredFishVoice[]> {
    const voices = (await this.prisma.db.orm.public.FishVoice.where({
      source: 'CUSTOM',
      ownerUserId: userId,
    }).all()) as StoredFishVoice[];

    return voices.sort(
      (first, second) =>
        first.createdAt.epochMilliseconds - second.createdAt.epochMilliseconds,
    );
  }

  private async getUserPreference(
    userId: string,
  ): Promise<UserVoicePreference | null> {
    return (await this.prisma.db.orm.public.User.where({
      id: userId,
    }).first()) as UserVoicePreference | null;
  }

  private async getAccessibleVoice(
    userId: string,
    voiceId: string,
  ): Promise<StoredFishVoice> {
    const voice = (await this.prisma.db.orm.public.FishVoice.where({
      id: voiceId,
    }).first()) as StoredFishVoice | null;

    if (!voice || !this.isAccessibleToUser(voice, userId)) {
      throw this.createVoiceNotFoundException();
    }

    return voice;
  }

  private isAccessibleToUser(voice: StoredFishVoice, userId: string): boolean {
    return voice.source === 'DEFAULT' || voice.ownerUserId === userId;
  }

  private createVoiceNotFoundException(): NotFoundException {
    return new NotFoundException({
      code: API_ERROR_CODES.notFound,
      message: 'Fish voice not found',
    });
  }

  private toResponse(
    voice: StoredFishVoice,
    selected: boolean,
  ): FishVoiceResponse {
    return {
      id: voice.id,
      referenceId: voice.referenceId,
      name: voice.name,
      source: voice.source,
      enabled: voice.isEnabled,
      selected,
    };
  }
}

function getDefaultCatalogueKey(referenceId: string): string {
  return `default:${referenceId}`;
}

function getCustomCatalogueKey(userId: string, referenceId: string): string {
  return `custom:${userId}:${referenceId}`;
}

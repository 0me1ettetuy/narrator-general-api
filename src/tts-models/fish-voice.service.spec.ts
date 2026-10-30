import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service.js';
import { temporalNow, type Instant } from '../prisma/temporal.js';

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

import { FishVoiceService } from './fish-voice.service.js';

type TestVoice = {
  id: string;
  catalogueKey: string;
  referenceId: string;
  name: string;
  source: 'DEFAULT' | 'CUSTOM';
  ownerUserId: string | null;
  isEnabled: boolean;
  defaultOrder: number | null;
  createdAt: Instant;
  updatedAt: Instant;
};

type TestUser = {
  id: string;
  selectedFishVoiceId: string | null;
  updatedAt: Instant;
};

describe('FishVoiceService', () => {
  let configuredVoices: string;
  let storedVoices: TestVoice[];
  let users: TestUser[];
  let service: FishVoiceService;

  const matches = <T extends object>(value: T, criteria: Partial<T>): boolean =>
    Object.entries(criteria).every(
      ([key, expected]) => value[key as keyof T] === expected,
    );

  const createVoiceDelegate = () => ({
    where: jest.fn((criteria: Partial<TestVoice>) => ({
      first: jest.fn(() =>
        Promise.resolve(storedVoices.find((voice) => matches(voice, criteria))),
      ),
      all: jest.fn(() =>
        Promise.resolve(
          storedVoices.filter((voice) => matches(voice, criteria)),
        ),
      ),
      update: jest.fn((data: Partial<TestVoice>) => {
        const matching = storedVoices.filter((voice) =>
          matches(voice, criteria),
        );
        matching.forEach((voice) => Object.assign(voice, data));

        return Promise.resolve(matching[0] ?? null);
      }),
      deleteAndCount: jest.fn(() => {
        const before = storedVoices.length;
        storedVoices = storedVoices.filter(
          (voice) => !matches(voice, criteria),
        );

        return Promise.resolve(before - storedVoices.length);
      }),
    })),
    create: jest.fn((value: Omit<TestVoice, 'createdAt'>) => {
      const voice = { ...value, createdAt: temporalNow() } as TestVoice;
      storedVoices.push(voice);

      return Promise.resolve(voice);
    }),
  });

  const createUserDelegate = () => ({
    where: jest.fn((criteria: Partial<TestUser>) => ({
      first: jest.fn(() =>
        Promise.resolve(users.find((user) => matches(user, criteria)) ?? null),
      ),
      update: jest.fn((data: Partial<TestUser>) => {
        const matching = users.filter((user) => matches(user, criteria));
        matching.forEach((user) => Object.assign(user, data));

        return Promise.resolve(matching[0] ?? null);
      }),
    })),
  });

  beforeEach(() => {
    configuredVoices = JSON.stringify([
      { id: 'sarah-reference-id', name: 'Sarah' },
      { id: 'adrian-reference-id', name: 'Adrian' },
    ]);
    storedVoices = [];
    users = [
      {
        id: 'user-id',
        selectedFishVoiceId: null,
        updatedAt: temporalNow(),
      },
      {
        id: 'other-user-id',
        selectedFishVoiceId: null,
        updatedAt: temporalNow(),
      },
    ];
    const database = {
      orm: {
        public: {
          FishVoice: createVoiceDelegate(),
          User: createUserDelegate(),
          UserFishVoice: {
            where: jest.fn(() => ({
              all: jest.fn().mockResolvedValue([]),
            })),
          },
        },
      },
    };
    const prisma = {
      db: {
        ...database,
        transaction: jest.fn(async (callback) => callback(database)),
      },
    } as unknown as PrismaService;

    service = new FishVoiceService(prisma, {
      get: jest.fn((key: string) =>
        key === 'FISH_DEFAULT_VOICES' ? configuredVoices : undefined,
      ),
    } as unknown as ConfigService);
  });

  it('syncs config defaults, preserves removed rows, and marks them unavailable', async () => {
    await service.onModuleInit();

    expect(storedVoices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          referenceId: 'sarah-reference-id',
          source: 'DEFAULT',
          isEnabled: true,
          defaultOrder: 0,
        }),
        expect.objectContaining({
          referenceId: 'adrian-reference-id',
          source: 'DEFAULT',
          isEnabled: true,
          defaultOrder: 1,
        }),
      ]),
    );

    configuredVoices = JSON.stringify([
      { id: 'adrian-reference-id', name: 'Adrian' },
    ]);
    await service.onModuleInit();

    expect(storedVoices).toHaveLength(2);
    expect(
      storedVoices.find((voice) => voice.referenceId === 'sarah-reference-id'),
    ).toMatchObject({ isEnabled: false, defaultOrder: null });
    expect(
      storedVoices.find((voice) => voice.referenceId === 'adrian-reference-id'),
    ).toMatchObject({ isEnabled: true, defaultOrder: 0 });
  });

  it('lists and selects shared defaults and owned custom voices', async () => {
    await service.onModuleInit();
    const defaultVoice = storedVoices.find(
      (voice) => voice.source === 'DEFAULT',
    ) as TestVoice;

    await expect(
      service.selectVoice('user-id', defaultVoice.id),
    ).resolves.toMatchObject({
      id: defaultVoice.id,
      source: 'DEFAULT',
      selected: true,
    });
    await expect(service.resolveVoiceReferenceId('user-id')).resolves.toBe(
      defaultVoice.referenceId,
    );

    const customVoice = await service.addVoice('user-id', {
      referenceId: 'custom-reference-id',
      name: 'My narrator',
    });
    await service.selectVoice('user-id', customVoice.id);

    await expect(service.getVoices('user-id')).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'DEFAULT' }),
        expect.objectContaining({
          id: customVoice.id,
          source: 'CUSTOM',
          selected: true,
        }),
      ]),
    );
    await expect(service.resolveVoiceReferenceId('user-id')).resolves.toBe(
      'custom-reference-id',
    );
  });

  it('does not expose or allow selection of another user’s custom voice', async () => {
    const otherUsersVoice = await service.addVoice('other-user-id', {
      referenceId: 'other-user-reference-id',
      name: 'Other user narrator',
    });

    await expect(
      service.selectVoice('user-id', otherUsersVoice.id),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NOT_FOUND' }),
    });
    await expect(service.getVoices('user-id')).resolves.not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: otherUsersVoice.id }),
      ]),
    );
  });
});

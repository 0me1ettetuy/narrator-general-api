import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service.js';
import { temporalNow, type Instant } from '../prisma/temporal.js';
import type { FishVoiceService } from './fish-voice.service.js';

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

import { FishCredentialService } from './fish-credential.service.js';

type TestVoice = {
  id: string;
  userId: string;
  referenceId: string;
  name: string | null;
  isSelected: boolean;
  createdAt: Instant;
  updatedAt: Instant;
};

describe('FishCredentialService', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  const createdCredentials: Array<Record<string, unknown>> = [];
  let storedCredential: Record<string, unknown> | null;
  let storedVoices: TestVoice[];
  const credentialFirst = jest.fn();
  const credentialCreate = jest.fn();
  const credentialUpdate = jest.fn();
  const credentialDelete = jest.fn();
  const voiceCreate = jest.fn();

  const database = {
    orm: {
      public: {
        UserTtsProviderCredential: {
          where: jest.fn(() => ({
            first: credentialFirst,
            update: credentialUpdate,
            deleteAndCount: credentialDelete,
          })),
          create: credentialCreate,
        },
        UserFishVoice: {
          where: jest.fn((criteria: Partial<TestVoice>) => ({
            first: jest.fn(() =>
              storedVoices.find((voice) =>
                Object.entries(criteria).every(
                  ([key, value]) => voice[key as keyof TestVoice] === value,
                ),
              ),
            ),
            all: jest.fn(() =>
              storedVoices.filter((voice) =>
                Object.entries(criteria).every(
                  ([key, value]) => voice[key as keyof TestVoice] === value,
                ),
              ),
            ),
            update: jest.fn((data: Partial<TestVoice>) => {
              const matching = storedVoices.filter((voice) =>
                Object.entries(criteria).every(
                  ([key, value]) => voice[key as keyof TestVoice] === value,
                ),
              );
              matching.forEach((voice) => Object.assign(voice, data));

              return Promise.resolve(matching[0] ?? null);
            }),
            deleteAndCount: jest.fn(() => {
              const before = storedVoices.length;
              storedVoices = storedVoices.filter(
                (voice) =>
                  !Object.entries(criteria).every(
                    ([key, value]) => voice[key as keyof TestVoice] === value,
                  ),
              );

              return Promise.resolve(before - storedVoices.length);
            }),
          })),
          create: voiceCreate,
        },
      },
    },
  };
  const prisma = {
    db: {
      ...database,
      transaction: jest.fn(async (callback) => callback(database)),
    },
  };
  const encryptionKey = Buffer.alloc(32, 7).toString('base64');
  const fishVoices = {
    getVoices: jest.fn().mockResolvedValue([]),
  } as unknown as FishVoiceService;

  let service: FishCredentialService;

  beforeEach(() => {
    storedCredential = null;
    storedVoices = [];
    createdCredentials.length = 0;
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    credentialFirst.mockImplementation(() => storedCredential);
    credentialCreate.mockImplementation((value: Record<string, unknown>) => {
      storedCredential = { id: 'credential-id', ...value };
      createdCredentials.push(value);

      return Promise.resolve(storedCredential);
    });
    credentialUpdate.mockImplementation((value: Record<string, unknown>) => {
      storedCredential = { ...storedCredential, ...value };

      return Promise.resolve(storedCredential);
    });
    voiceCreate.mockImplementation((value: Omit<TestVoice, 'createdAt'>) => {
      const voice = { ...value, createdAt: temporalNow() } as TestVoice;
      storedVoices.push(voice);

      return Promise.resolve(voice);
    });
    service = new FishCredentialService(
      prisma as unknown as PrismaService,
      {
        get: jest.fn((key: string) =>
          key === 'TTS_CREDENTIAL_ENCRYPTION_KEY' ? encryptionKey : undefined,
        ),
      } as unknown as ConfigService,
      fishVoices,
    );
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('validates a key, encrypts it before storage, and returns no secret', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    const response = await service.saveAndValidate(
      'user-id',
      'fish-secret-key',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.fish.audio/wallet/self/package',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer fish-secret-key' },
      }),
    );
    expect(createdCredentials[0]).toMatchObject({
      provider: 'FISH_AUDIO',
      state: 'VALID',
      encryptionKeyVersion: 1,
    });
    expect(createdCredentials[0].encryptedSecret).not.toContain(
      'fish-secret-key',
    );
    expect(JSON.stringify(response)).not.toContain('fish-secret-key');
    await expect(service.getValidApiKey('user-id')).resolves.toBe(
      'fish-secret-key',
    );
  });

  it('stores an invalid key as invalid without exposing it', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));

    await expect(
      service.saveAndValidate('user-id', 'bad-fish-key'),
    ).resolves.toMatchObject({
      credentialState: 'INVALID',
      setupRequired: true,
    });
    expect(createdCredentials[0].encryptedSecret).not.toContain('bad-fish-key');
  });

  it('binds encrypted credentials to their owning user', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    await service.saveAndValidate('user-a', 'fish-secret-key');

    // The database lookup is scoped by user ID in production. This extra
    // cryptographic binding also prevents a copied ciphertext from working for
    // any other user.
    await expect(service.getValidApiKey('user-b')).rejects.toThrow(
      'Stored Fish credential could not be decrypted',
    );
  });

  it('returns the missing setup state and no saved voices without calling Fish', async () => {
    await expect(service.getPublicStatus('user-id')).resolves.toEqual({
      id: 'fish-audio',
      credentialState: 'MISSING',
      setupRequired: true,
      lastValidatedAt: null,
      voices: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the voice catalogue supplied by the voice service', async () => {
    jest.mocked(fishVoices.getVoices).mockResolvedValueOnce([
      {
        id: 'default-voice-id',
        referenceId: 'sarah-reference-id',
        name: 'Sarah',
        source: 'DEFAULT',
        enabled: true,
        selected: true,
      },
    ]);

    await expect(service.getPublicStatus('user-id')).resolves.toMatchObject({
      voices: [
        {
          id: 'default-voice-id',
          source: 'DEFAULT',
          selected: true,
        },
      ],
    });
  });
});

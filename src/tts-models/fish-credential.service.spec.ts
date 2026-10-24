import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service.js';

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

import { FishCredentialService } from './fish-credential.service.js';

describe('FishCredentialService', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  const createdCredentials: Array<Record<string, unknown>> = [];
  let storedCredential: Record<string, unknown> | null;
  const credentialFirst = jest.fn();
  const credentialCreate = jest.fn();
  const credentialUpdate = jest.fn();
  const credentialDelete = jest.fn();
  const prisma = {
    db: {
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
        },
      },
    },
  };
  const encryptionKey = Buffer.alloc(32, 7).toString('base64');

  let service: FishCredentialService;

  beforeEach(() => {
    storedCredential = null;
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
    service = new FishCredentialService(
      prisma as unknown as PrismaService,
      {
        get: jest.fn((key: string) =>
          key === 'TTS_CREDENTIAL_ENCRYPTION_KEY' ? encryptionKey : undefined,
        ),
      } as unknown as ConfigService,
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

  it('returns the missing setup state without calling Fish', async () => {
    await expect(service.getPublicStatus('user-id')).resolves.toEqual({
      id: 'fish-audio',
      credentialState: 'MISSING',
      setupRequired: true,
      lastValidatedAt: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

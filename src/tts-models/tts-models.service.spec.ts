import type { FishCredentialService } from './fish-credential.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

jest.mock('./fish-credential.service.js', () => ({
  FishCredentialService: class FishCredentialService {},
}));

jest.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

import { TtsModelAvailabilityService } from './tts-model-availability.service.js';
import { TtsModelRegistryService } from './tts-model-registry.service.js';
import { TtsModelsService } from './tts-models.service.js';

describe('TtsModelsService', () => {
  const createRegistry = () =>
    ({
      getLocalModels: jest.fn().mockReturnValue([
        {
          id: 'local.piper.en-us-amy',
          provider: 'local-piper',
          displayName: 'Piper — English (Amy)',
          enabled: true,
          healthUrl: 'http://localhost:9100/health',
          synthesisUrl: 'http://localhost:9100/',
          healthStrategy: 'HTTP_OK',
        },
      ]),
      getFishModels: jest.fn().mockReturnValue([
        {
          id: 'fish.s2.1-pro-free',
          providerModel: 's2.1-pro-free',
          displayName: 'Fish Audio — S2.1 Pro Free',
          enabled: true,
        },
      ]),
    }) as unknown as TtsModelRegistryService;

  const availableLocalModel = {
    getLocalModelAvailability: jest.fn().mockResolvedValue({
      status: 'READY',
      selectable: true,
      reasonCode: null,
    }),
  } as unknown as TtsModelAvailabilityService;

  const userPreferenceFirst = jest.fn();
  const userPreferenceUpdate = jest.fn();
  const prisma = {
    db: {
      orm: {
        public: {
          User: {
            where: jest.fn(() => ({
              first: userPreferenceFirst,
              update: userPreferenceUpdate,
            })),
          },
        },
      },
    },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    userPreferenceFirst.mockResolvedValue({ defaultTtsModelKey: null });
    userPreferenceUpdate.mockResolvedValue(undefined);
  });

  it('shows the Fish setup state but no Fish cards when the user has no key', async () => {
    const fishCredentials = {
      getPublicStatus: jest.fn().mockResolvedValue({
        id: 'fish-audio',
        credentialState: 'MISSING',
        setupRequired: true,
        lastValidatedAt: null,
      }),
    } as unknown as FishCredentialService;
    const service = new TtsModelsService(
      prisma,
      createRegistry(),
      availableLocalModel,
      fishCredentials,
    );

    await expect(service.listModels('user-id')).resolves.toEqual({
      selectedModelId: null,
      providers: [
        {
          id: 'fish-audio',
          credentialState: 'MISSING',
          setupRequired: true,
          lastValidatedAt: null,
        },
      ],
      groups: [
        {
          id: 'local',
          displayName: 'Local models',
          models: [
            {
              id: 'local.piper.en-us-amy',
              provider: 'local-piper',
              displayName: 'Piper — English (Amy)',
              source: 'LOCAL',
              status: 'READY',
              selectable: true,
              reasonCode: null,
            },
          ],
        },
      ],
    });
  });

  it('shows enabled Fish cards only for a user with a valid key', async () => {
    const fishCredentials = {
      getPublicStatus: jest.fn().mockResolvedValue({
        id: 'fish-audio',
        credentialState: 'VALID',
        setupRequired: false,
        lastValidatedAt: null,
      }),
    } as unknown as FishCredentialService;
    const service = new TtsModelsService(
      prisma,
      createRegistry(),
      availableLocalModel,
      fishCredentials,
    );

    const response = await service.listModels('user-id');

    expect(response.groups[1]).toEqual({
      id: 'fish-audio',
      displayName: 'Fish Audio',
      models: [
        {
          id: 'fish.s2.1-pro-free',
          provider: 'fish-audio',
          displayName: 'Fish Audio — S2.1 Pro Free',
          source: 'FISH',
          status: 'READY',
          selectable: true,
          reasonCode: null,
        },
      ],
    });
  });

  it('checks the user credential before selecting a Fish model', async () => {
    const fishCredentials = {
      assertValidCredential: jest.fn().mockResolvedValue(undefined),
    } as unknown as FishCredentialService;
    const service = new TtsModelsService(
      prisma,
      createRegistry(),
      availableLocalModel,
      fishCredentials,
    );

    await expect(
      service.getSelectableModel('user-id', 'fish.s2.1-pro-free'),
    ).resolves.toEqual({
      id: 'fish.s2.1-pro-free',
      source: 'FISH',
      providerModel: 's2.1-pro-free',
    });
    expect(fishCredentials.assertValidCredential).toHaveBeenCalledWith(
      'user-id',
    );
  });

  it('saves a validated model as the user default', async () => {
    const fishCredentials = {
      assertValidCredential: jest.fn().mockResolvedValue(undefined),
    } as unknown as FishCredentialService;
    const service = new TtsModelsService(
      prisma,
      createRegistry(),
      availableLocalModel,
      fishCredentials,
    );

    await expect(
      service.selectModel('user-id', 'local.piper.en-us-amy'),
    ).resolves.toEqual({ selectedModelId: 'local.piper.en-us-amy' });
    expect(userPreferenceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultTtsModelKey: 'local.piper.en-us-amy',
      }),
    );
  });

  it('uses the saved model when generation does not specify one', async () => {
    userPreferenceFirst.mockResolvedValue({
      defaultTtsModelKey: 'local.piper.en-us-amy',
    });
    const service = new TtsModelsService(
      prisma,
      createRegistry(),
      availableLocalModel,
      {} as FishCredentialService,
    );

    await expect(service.getSelectableModel('user-id', null)).resolves.toEqual({
      id: 'local.piper.en-us-amy',
      source: 'LOCAL',
      providerModel: null,
    });
  });
});

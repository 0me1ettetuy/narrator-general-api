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
          voices: [
            { id: 'xenia', language: 'ru', displayName: 'Xenia' },
            { id: 'en_0', language: 'en', displayName: 'English 1' },
          ],
        },
      ]),
      getFishModels: jest.fn().mockReturnValue([
        {
          id: 'fish.s2.1-pro-free',
          providerModel: 's2.1-pro-free',
          displayName: 'Fish Audio — S2.1 Pro Free',
          requiresCredit: false,
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
        voices: [],
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
          voices: [],
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
              voices: [
                { id: 'xenia', language: 'ru', displayName: 'Xenia' },
                { id: 'en_0', language: 'en', displayName: 'English 1' },
              ],
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
        voices: [],
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
          voices: [],
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

  describe('paid Fish model credit check', () => {
    const paidFishModels = [
      {
        id: 'fish.s2.1-pro-free',
        providerModel: 's2.1-pro-free',
        displayName: 'Free',
        requiresCredit: false,
        enabled: true,
      },
      {
        id: 'fish.s2.1-pro',
        providerModel: 's2.1-pro',
        displayName: 'Pro',
        requiresCredit: true,
        enabled: true,
      },
    ];

    function createService(hasCredit: boolean | null) {
      const registry = {
        getLocalModels: jest.fn().mockReturnValue([]),
        getFishModels: jest.fn().mockReturnValue(paidFishModels),
      } as unknown as TtsModelRegistryService;
      const fishCredentials = {
        getPublicStatus: jest.fn().mockResolvedValue({
          id: 'fish-audio',
          credentialState: 'VALID',
          setupRequired: false,
          lastValidatedAt: null,
          voices: [],
        }),
        assertValidCredential: jest.fn().mockResolvedValue(undefined),
        hasApiCredit: jest.fn().mockResolvedValue(hasCredit),
      } as unknown as FishCredentialService;

      return new TtsModelsService(
        prisma,
        registry,
        availableLocalModel,
        fishCredentials,
      );
    }

    it('marks the paid model unavailable when the account has no credit', async () => {
      const response = await createService(false).listModels('user-id');

      expect(response.groups[1].models).toEqual([
        expect.objectContaining({ id: 'fish.s2.1-pro-free', selectable: true }),
        expect.objectContaining({
          id: 'fish.s2.1-pro',
          status: 'UNAVAILABLE',
          selectable: false,
          reasonCode: 'FISH_CREDIT_REQUIRED',
        }),
      ]);
    });

    it.each([true, null])(
      'keeps the paid model selectable when credit is %s',
      async (hasCredit) => {
        const response = await createService(hasCredit).listModels('user-id');

        expect(response.groups[1].models[1]).toEqual(
          expect.objectContaining({ id: 'fish.s2.1-pro', selectable: true }),
        );
      },
    );

    it('refuses to select the paid model without credit, but not the free one', async () => {
      const service = createService(false);

      await expect(
        service.getSelectableModel('user-id', 'fish.s2.1-pro'),
      ).rejects.toThrow('no credit');
      await expect(
        service.getSelectableModel('user-id', 'fish.s2.1-pro-free'),
      ).resolves.toEqual(expect.objectContaining({ id: 'fish.s2.1-pro-free' }));
    });
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

  it('rejects selection when the user has no default model and none is requested', async () => {
    const service = new TtsModelsService(
      prisma,
      createRegistry(),
      availableLocalModel,
      {} as FishCredentialService,
    );

    await expect(
      service.getSelectableModel('user-id', null),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'TTS_MODEL_NOT_SELECTED' }),
    });
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

  describe('resolveLocalVoiceId', () => {
    function createService() {
      return new TtsModelsService(
        prisma,
        createRegistry(),
        availableLocalModel,
        {} as unknown as FishCredentialService,
      );
    }

    it('accepts a voice listed for the book language, and none means the default', () => {
      const service = createService();

      expect(
        service.resolveLocalVoiceId('local.piper.en-us-amy', 'ru-RU', 'xenia'),
      ).toBe('xenia');
      expect(
        service.resolveLocalVoiceId('local.piper.en-us-amy', 'en', undefined),
      ).toBeNull();
    });

    it('accepts a speaker listed under several languages for each of them', () => {
      const registry = {
        getLocalModels: jest.fn().mockReturnValue([
          {
            id: 'local.qwen3-tts-0-6b',
            voices: [
              { id: 'ryan', language: 'ru', displayName: 'Ryan' },
              { id: 'ryan', language: 'en', displayName: 'Ryan' },
            ],
          },
        ]),
      } as unknown as TtsModelRegistryService;
      const service = new TtsModelsService(
        prisma,
        registry,
        availableLocalModel,
        {} as unknown as FishCredentialService,
      );

      expect(
        service.resolveLocalVoiceId('local.qwen3-tts-0-6b', 'en', 'ryan'),
      ).toBe('ryan');
      expect(
        service.resolveLocalVoiceId('local.qwen3-tts-0-6b', 'ru', 'ryan'),
      ).toBe('ryan');
    });

    it('rejects a voice of another language or an unknown voice', () => {
      const service = createService();

      expect(() =>
        service.resolveLocalVoiceId('local.piper.en-us-amy', 'en', 'xenia'),
      ).toThrow('Voice is not available');
      expect(() =>
        service.resolveLocalVoiceId('local.piper.en-us-amy', null, 'en_0'),
      ).toThrow('Voice is not available');
      expect(() =>
        service.resolveLocalVoiceId('local.piper.en-us-amy', 'en', 'nope'),
      ).toThrow('Voice is not available');
    });
  });
});

export const LOCAL_TTS_MODEL_STATUSES = [
  'READY',
  'UNAVAILABLE',
  'DISABLED',
] as const;

export type LocalTtsModelStatus = (typeof LOCAL_TTS_MODEL_STATUSES)[number];

export type LocalTtsVoice = {
  id: string;
  language: 'ru' | 'en';
  displayName: string;
};

export type LocalTtsModelDefinition = {
  id: string;
  provider: string;
  displayName: string;
  enabledConfigKey: string;
  healthUrlConfigKey: string;
  synthesisUrlConfigKey: string;
  healthStrategy: 'HTTP_OK' | 'JSON_STATUS_HEALTHY' | 'JSON_STATUS_OK';
  // Fixed, read-only voices; the user picks one per request. Empty = engine default only.
  voices: LocalTtsVoice[];
};

export type ConfiguredLocalTtsModel = Omit<
  LocalTtsModelDefinition,
  'enabledConfigKey' | 'healthUrlConfigKey' | 'synthesisUrlConfigKey'
> & {
  enabled: boolean;
  healthUrl: string | null;
  synthesisUrl: string | null;
  healthStrategy: LocalTtsModelDefinition['healthStrategy'];
};

export type LocalTtsModelAvailability = {
  status: LocalTtsModelStatus;
  selectable: boolean;
  reasonCode: string | null;
};

export type FishTtsModelDefinition = {
  id: string;
  providerModel: string;
  displayName: string;
  enabledConfigKey: string;
  // Paid models fail with 402 on an account without Fish API credit.
  requiresCredit: boolean;
};

export type ConfiguredFishTtsModel = Omit<
  FishTtsModelDefinition,
  'enabledConfigKey'
> & {
  enabled: boolean;
};

export const FISH_CREDENTIAL_STATES = [
  'MISSING',
  'VALID',
  'INVALID',
  'UNKNOWN',
] as const;

export type FishCredentialState = (typeof FISH_CREDENTIAL_STATES)[number];

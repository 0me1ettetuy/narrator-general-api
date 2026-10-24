export const LOCAL_TTS_MODEL_STATUSES = [
  'READY',
  'UNAVAILABLE',
  'DISABLED',
] as const;

export type LocalTtsModelStatus = (typeof LOCAL_TTS_MODEL_STATUSES)[number];

export type LocalTtsModelDefinition = {
  id: string;
  provider: string;
  displayName: string;
  enabledConfigKey: string;
  healthUrlConfigKey: string;
  healthStrategy: 'HTTP_OK' | 'JSON_STATUS_READY';
};

export type ConfiguredLocalTtsModel = Omit<
  LocalTtsModelDefinition,
  'enabledConfigKey' | 'healthUrlConfigKey'
> & {
  enabled: boolean;
  healthUrl: string | null;
  healthStrategy: LocalTtsModelDefinition['healthStrategy'];
};

export type LocalTtsModelAvailability = {
  status: LocalTtsModelStatus;
  selectable: boolean;
  reasonCode: string | null;
};

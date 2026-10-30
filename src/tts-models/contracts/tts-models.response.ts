import type { Instant } from '../../prisma/temporal.js';
import type { LocalTtsModelStatus } from '../types/tts-model.type.js';

export type TtsModelSource = 'LOCAL' | 'FISH';

export type TtsModelResponse = {
  id: string;
  provider: string;
  displayName: string;
  source: TtsModelSource;
  status: LocalTtsModelStatus;
  selectable: boolean;
  reasonCode: string | null;
};

export type TtsModelGroupResponse = {
  id: 'local' | 'fish-audio';
  displayName: string;
  models: TtsModelResponse[];
};

export type FishCredentialResponse = {
  id: 'fish-audio';
  credentialState: 'MISSING' | 'VALID' | 'INVALID' | 'UNKNOWN';
  setupRequired: boolean;
  lastValidatedAt: Instant | null;
  voices: FishVoiceResponse[];
};

export type FishVoiceResponse = {
  id: string;
  referenceId: string;
  name: string | null;
  selected: boolean;
};

export type TtsModelsResponse = {
  selectedModelId: string | null;
  providers: [FishCredentialResponse];
  groups: TtsModelGroupResponse[];
};

export type TtsModelSelectionResponse = {
  selectedModelId: string;
};

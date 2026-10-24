import type { LocalTtsModelStatus } from '../types/tts-model.type.js';

export type TtsModelResponse = {
  id: string;
  provider: string;
  displayName: string;
  source: 'LOCAL';
  status: LocalTtsModelStatus;
  selectable: boolean;
  reasonCode: string | null;
};

export type TtsModelGroupResponse = {
  id: 'local';
  displayName: 'Local models';
  models: TtsModelResponse[];
};

export type TtsModelsResponse = {
  groups: TtsModelGroupResponse[];
};

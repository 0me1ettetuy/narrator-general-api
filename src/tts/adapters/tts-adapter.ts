import { Readable } from 'node:stream';

export const MP3_CONTENT_TYPE = 'audio/mpeg';
export const MAX_TTS_AUDIO_BYTES = 20 * 1024 * 1024;

export type TtsSynthesisInput = {
  text: string;
  userId?: string;
  providerModel?: string | null;
  voiceId?: string | null;
};

export type TtsSynthesisStream = {
  stream: Readable;
  mimeType: typeof MP3_CONTENT_TYPE;
  provider: string;
  model: string;
  voice: string;
  generationId: string | null;
  getByteSize: () => number;
  abort: () => void;
};

export interface TtsAdapter {
  synthesizeStream(input: TtsSynthesisInput): Promise<TtsSynthesisStream>;
}

export class TtsSynthesisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = TtsSynthesisError.name;
  }
}

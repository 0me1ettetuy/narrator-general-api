import { Readable, Transform } from 'node:stream';
import {
  MAX_TTS_AUDIO_BYTES,
  MP3_CONTENT_TYPE,
  type TtsSynthesisStream,
  TtsSynthesisError,
} from './tts-adapter.js';

export function assertSuccessfulMp3Response(response: Response): void {
  if (!response.ok) {
    throw new TtsSynthesisError(
      `TTS provider request failed with status ${response.status}`,
    );
  }

  const contentType = response.headers.get('content-type')?.toLowerCase();

  if (!contentType?.startsWith(MP3_CONTENT_TYPE)) {
    throw new TtsSynthesisError('TTS provider returned an unexpected format');
  }

  const contentLength = response.headers.get('content-length');

  if (!contentLength) {
    return;
  }

  const declaredByteSize = Number(contentLength);

  if (
    !Number.isSafeInteger(declaredByteSize) ||
    declaredByteSize < 1 ||
    declaredByteSize > MAX_TTS_AUDIO_BYTES
  ) {
    throw new TtsSynthesisError('TTS provider audio exceeds the allowed size');
  }
}

export function createTtsAudioStream(
  body: ReadableStream<Uint8Array>,
  controller: AbortController,
  idleTimeoutMs: number,
): Pick<TtsSynthesisStream, 'stream' | 'getByteSize' | 'abort'> {
  let byteSize = 0;
  let idleTimeout = startIdleTimeout(controller, idleTimeoutMs);
  const source = Readable.fromWeb(
    body as unknown as Parameters<typeof Readable.fromWeb>[0],
  );
  const stream = new Transform({
    transform: (chunk, _encoding, callback) => {
      const chunkByteSize = Buffer.byteLength(chunk);

      if (chunkByteSize > 0) {
        clearTimeout(idleTimeout);
        idleTimeout = startIdleTimeout(controller, idleTimeoutMs);
        byteSize += chunkByteSize;
      }

      if (byteSize > MAX_TTS_AUDIO_BYTES) {
        controller.abort();
        callback(
          new TtsSynthesisError('TTS provider audio exceeds the allowed size'),
        );
        return;
      }

      callback(null, chunk);
    },
    flush: (callback) => {
      if (!byteSize) {
        callback(
          new TtsSynthesisError('TTS provider returned an empty audio file'),
        );
        return;
      }

      callback();
    },
  });

  const clearIdleTimeout = () => clearTimeout(idleTimeout);

  source.once('error', (error) => stream.destroy(error));
  stream.once('close', clearIdleTimeout);
  stream.once('end', clearIdleTimeout);
  stream.once('error', clearIdleTimeout);
  source.pipe(stream);

  return {
    stream,
    getByteSize: () => byteSize,
    abort: () => {
      controller.abort();
      source.destroy();
      stream.destroy();
    },
  };
}

export function startIdleTimeout(
  controller: AbortController,
  idleTimeoutMs: number,
): ReturnType<typeof setTimeout> {
  return setTimeout(() => controller.abort(), idleTimeoutMs);
}

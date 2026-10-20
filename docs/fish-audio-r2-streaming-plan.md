# Temporary plan: stream Fish Audio directly to R2

Delete this planning file after implementation is accepted.

## Status: implemented on 2026-10-20

Steps 1–3 are implemented and verified against the configured Fish and R2
accounts. The worker now streams each Fish response to an S3-compatible R2
multipart upload, buffering at most one 5 MB multipart part. The optional
mid-stream cancellation improvement remains deferred; existing safe cleanup
after an in-flight segment finishes is retained.

## Goal

Avoid collecting a complete generated MP3 segment in worker memory before
uploading it. For each chapter text segment:

```text
BullMQ worker -> Fish Audio HTTP stream -> R2 temporary MP3 object
                                      -> mark AudioChunk READY in Postgres
```

This is response streaming, not a Fish "submit a job and poll it later" API.
The worker remains busy while Fish generates that segment, but receives and
forwards audio progressively.

## Current state

- The worker already runs apart from the HTTP API.
- `TtsService` calls direct Fish `POST /v1/tts` and reads its response in
  pieces, but combines those pieces into one `Uint8Array`.
- `ChapterTtsService` then calls `StorageService.putObjectBytes()`.
- `StorageService.putObjectStream()` already accepts a Node `Readable`, so the
  R2 boundary is ready for a streamed body.
- The persistent `AudioChunk` row becomes `READY` only after its complete
  temporary MP3 object has been stored. Keep this rule.

## Decisions

Keep:

- one durable BullMQ synthesis job per chapter;
- ordered, sentence-aware text segments;
- one temporary R2 MP3 object and one `AudioChunk` DB row per text segment;
- existing retries, cancellation, merge, and cleanup behavior;
- frontend progress at completed-segment granularity.

Do not add:

- Fish WebSocket TTS: it is for text arriving live, such as LLM tokens;
- a second queue, provider-job table, webhook, or polling endpoint;
- a DB update for every incoming audio byte.

## Implementation steps

### 1. Verify R2 accepts a streamed `PutObject`

Write a focused integration/probe using a small Node `Readable` and the
existing `StorageService.putObjectStream()`. Verify the object can be read
back, has the expected byte count, and is deleted afterwards.

If R2 rejects the AWS SDK's streamed/chunked upload, use an S3 multipart
upload helper. Do not fall back to buffering whole chapter segments by
default.

### 2. Replace byte-returning TTS with a stream result

Replace the `TtsService.synthesize()` result shape with a narrow stream result:

```ts
type TtsAudioStream = {
  stream: Readable;
  mimeType: 'audio/mpeg';
  provider: 'fish-audio';
  model: string;
  voice: string;
  generationId: string | null;
  getByteSize(): number;
  abort(): void;
};
```

Implementation details:

- call direct Fish `POST /v1/tts` with `text`, `reference_id`, and
  `format: 'mp3'`;
- validate status and `Content-Type` before exposing the stream;
- convert the browser-style `response.body` to a Node `Readable` with
  `Readable.fromWeb()`;
- put a small counting/limiting `Transform` in the stream path;
- enforce the existing 20 MB limit while bytes arrive, not after buffering;
- reset the five-minute idle timer whenever a non-empty audio piece arrives;
- abort the Fish request if R2 upload fails or the size limit is exceeded.

The stream result must not expose Fish error bodies, API keys, or book text.

### 3. Pipe the stream to R2 from the chapter workflow

In `ChapterTtsService`, replace:

```text
Fish -> Uint8Array -> putObjectBytes
```

with:

```text
Fish stream -> putObjectStream -> obtain counted byte size -> persist READY
```

Only after `putObjectStream()` resolves successfully:

1. re-check that the audio job is still active;
2. delete the just-uploaded R2 object if it was cancelled/deleted;
3. persist the `AudioChunk` object key, MIME type, byte size, provider trace,
   and completed count in the existing transaction.

If Fish or R2 fails, leave the chunk non-ready so the existing retry can
generate it again. Never mark a partly uploaded object as ready.

### 4. Preserve cancellation and deletion safety

Initial implementation may retain current behavior: a cancellation that occurs
mid-transfer is noticed after that transfer completes, then the temporary R2
object is deleted and no chunk is marked ready.

After the simple version is proven, optionally add a small periodic active-job
check during a long stream. On cancellation it should abort the Fish stream,
destroy the R2 upload, delete a partial R2 object if present, and exit without
recording a failure. Do not poll Postgres for every audio piece.

### 5. Test and observe

Unit tests:

- Fish request headers/body and MP3 validation;
- byte counter and 20 MB limit;
- idle timeout resets after received bytes;
- Fish/R2 failure does not mark an `AudioChunk` ready;
- chapter workflow calls `putObjectStream()`, not `putObjectBytes()`.

Live verification:

1. Generate a short chapter and confirm final playback/download still works.
2. Generate the known 2,150-word chapter.
3. Confirm temporary chunk objects appear in R2 one by one.
4. Confirm worker memory does not grow with the full MP3 segment.
5. Cancel and delete during generation; confirm no temporary objects or ready
   DB rows are left behind.
6. Confirm merge and final cleanup remain unchanged.

## Rollout order

1. R2 streamed-upload probe.
2. TTS stream result and tests.
3. Chapter workflow piping and cancellation cleanup.
4. Short live generation.
5. Long-chapter generation and cancellation/delete checks.

No frontend, REST endpoint, OpenAPI, Prisma schema, or migration change is
needed for this refactor.

# TTS runtime rules

Invariants for model selection, queues, Fish credentials and voices, and local
Silero TTS. The model list and how to add a model are in the
[model catalogue guide](tts-model-catalogue.md).

Silero TTS (CPU) and Qwen3-TTS 0.6B (quantized GGUF, NVIDIA GPU with 4 GB or more), both Russian + English and off by default, are the enabled local models. Piper, Kokoro-82M and Chatterbox Turbo are removed or disabled. Fish Audio is the other provider. `src/tts/adapters/` contains the
narrow shared TTS adapter interface and the Silero and Qwen3-TTS adapters; the Piper, Kokoro and Chatterbox adapter files and their
registry entries are commented out in place, not deleted. See
[`local-tts-models-removed.md`](local-tts-models-removed.md)
for the full restoration record and
[`docs/issues/local-tts-models-disabled.md`](../issues/local-tts-models-disabled.md)
for why. `TtsAdapterResolverService` resolves Fish, Silero and Qwen3-TTS; a local `modelId` with no adapter or registry entry returns `404 TTS_MODEL_NOT_FOUND`.

- Choose a ready model with `PUT /tts/models/selection`. It stores the user's
  nullable `defaultTtsModelKey` preference. `GET /tts/models` returns it as
  `selectedModelId`.
- Chapter-audio requests can omit `modelId` and use that saved preference, or
  include it for a one-request override. The resolved ID is persisted as
  `Audio.modelKey`; a retry cannot silently switch providers or voices. If
  neither is set, the request is rejected with `ttsModelNotSelected` rather
  than silently falling back to a guessed model.
- Chapter synthesis has two BullMQ queues chosen by the snapshotted model:
  `fish-chapter-tts` (concurrency `TTS_FISH_CONCURRENCY`, default 2) and
  `chapter-tts`, which carries the local Silero jobs, one at a time. Fish `429`/`5xx` responses are retried in-process
  (honouring `Retry-After`, otherwise 2/4/8/16 s) before the job attempt
  fails.
- Fish keys belong to a user, are AES-256-GCM encrypted in Postgres, and are
  decrypted only in worker memory immediately before a Fish request. Never
  use or add a global Fish API key to the server environment.
- `FishVoice` is the durable shared catalogue. A row is either a shared
  `DEFAULT` voice or a user-owned `CUSTOM` voice; `User.selectedFishVoiceId`
  points to either. On startup, `FISH_DEFAULT_VOICES` safely upserts shared
  defaults and disables—never deletes—entries removed from configuration,
  clearing `selectedFishVoiceId` for every user who had that voice selected
  so a stale selection can't linger (`FishVoiceService.syncConfiguredDefaults`).
  Fish synthesis requires the user's own selected enabled voice
  (`User.selectedFishVoiceId`); it rejects with `fishVoiceNotSelected` rather
  than falling back to a default voice when none is selected. Do not
  auto-switch based on guessed language. The queue snapshots the resolved
  reference ID in `Audio.voice`, so retries and existing generation jobs
  cannot mix voices after a catalogue change. A chapter's response exposes
  that id's current display name as `audio.voiceName`, resolved against the
  user's voice catalogue at response time by
  `BooksService.getVoiceNamesByReferenceId` (used by both `BooksService` and
  `ChapterCurationService`) — null if the voice has since been removed
  entirely, independent of the immutable snapshotted `voice` id.

`GET /tts/models` returns the `local` group (Silero and Qwen3-TTS when enabled), `selectedModelId`, and the
current user's safe Fish credential state (`MISSING`, `VALID`, `INVALID`, or
`UNKNOWN`). Fish model cards appear only for a valid key. The API never returns
the key, even partly. Use `PUT /tts/models/providers/fish-audio/credential` to
save/validate it and `DELETE /tts/models/providers/fish-audio/credential` to
remove it. `POST /tts/models/providers/fish-audio/voices` saves a voice,
`PUT /tts/models/providers/fish-audio/voices/selection` selects it, and
`DELETE /tts/models/providers/fish-audio/voices/:voiceId` removes it. Set the
deployment secret `TTS_CREDENTIAL_ENCRYPTION_KEY` to the output of
`openssl rand -base64 32` before users can save credentials.

`COMPOSE_PROFILES=true` is fixed and never changes; Compose starts MinIO only
when `MINIO_ENABLED=true` is also set. Silero TTS runs under the `silero-tts` Compose profile, switched by `TTS_LOCAL_SILERO_TTS_ENABLED`; Qwen3-TTS runs under `qwen3-tts`, switched by `TTS_LOCAL_QWEN3_TTS_ENABLED`. Local models use 600-character chunks (`getSegmentMaxCharacters`), Fish keeps 4,000.

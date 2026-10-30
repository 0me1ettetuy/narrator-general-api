# TTS model catalogue maintenance guide

## The source of truth

The list of models is **code**, not a seeded database table.

`src/tts-models/tts-model-registry.service.ts` contains two static lists:

- `LOCAL_TTS_MODEL_DEFINITIONS` — Docker/self-hosted models;
- `FISH_TTS_MODEL_DEFINITIONS` — Fish Audio models.

At application start, `TtsModelRegistryService` reads those definitions and
their environment toggles into its in-memory catalogue. `GET /tts/models`
builds a user-specific response from that catalogue:

```text
registry definition + deployment .env + local health result
                              + requesting user's Fish credential state
                              + requesting user's saved model preference
                              -> GET /tts/models
```

Postgres does **not** contain a model catalogue. It contains only durable
user-specific state:

- `UserTtsProviderCredential`: the user's encrypted Fish key and its safe
  validation state;
- `User.defaultTtsModelKey`: the user's nullable saved model preference;
- `UserFishVoice`: each user's saved Fish reference voices and which one is
  selected;
- `Audio.modelKey`: the exact model chosen for that generated audio.

This keeps deployments simple: updating code and `.env` changes the available
catalogue, while audio already in progress stays tied to its original model.

`defaultTtsModelKey` intentionally has no foreign key: model descriptors live
in code, not Postgres. The API validates the ID against the live catalogue
whenever a user saves it or starts a generation.

## Current model definitions

| Source | Model ID sent by frontend | Definition location | Enable setting |
| --- | --- | --- | --- |
| Local | `local.piper.en-us-amy` | `LOCAL_TTS_MODEL_DEFINITIONS` | `TTS_LOCAL_PIPER_EN_US_AMY_ENABLED` |
| Local | `local.kokoro-82m` | `LOCAL_TTS_MODEL_DEFINITIONS` | `TTS_LOCAL_KOKORO_82M_ENABLED` |
| Local | `local.qwen3-tts-0.6b` | `LOCAL_TTS_MODEL_DEFINITIONS` | `TTS_LOCAL_QWEN3_TTS_0_6B_ENABLED` |
| Local | `local.chatterbox-turbo` | `LOCAL_TTS_MODEL_DEFINITIONS` | `TTS_LOCAL_CHATTERBOX_TURBO_ENABLED` |
| Fish | `fish.s2.1-pro-free` | `FISH_TTS_MODEL_DEFINITIONS` | `TTS_FISH_S2_1_PRO_FREE_ENABLED` |
| Fish | `fish.s2.1-pro` | `FISH_TTS_MODEL_DEFINITIONS` | `TTS_FISH_S2_1_PRO_ENABLED` |

Keep IDs stable. An ID is stored on `Audio.modelKey`, so renaming one breaks
retries and makes existing audio metadata unclear.

## Environment toggles

Fish toggles expose a known Fish model; they do not contain an API key:

```dotenv
TTS_FISH_S2_1_PRO_FREE_ENABLED="true"
TTS_FISH_S2_1_PRO_ENABLED="false"
```

When an authenticated user has no valid Fish key, `GET /tts/models` returns
the safe provider state (`MISSING`, `INVALID`, or `UNKNOWN`) and omits Fish
model cards. Once their key is valid, enabled Fish cards are returned. The key
itself is never returned.

Voice resolution is deliberately independent of the model choice:

```text
selected UserFishVoice -> configured Sarah/Adrian deployment fallback -> Fish Audio's provider default
```

Set `FISH_DEFAULT_VOICE` to `sarah` or `adrian`; the service reads the matching
`FISH_DEFAULT_VOICE_SARAH_ID` or `FISH_DEFAULT_VOICE_ADRIAN_ID`. Narrator does
not infer the text language and silently switch between the two. The model page
can add/select/remove user voices with:

```text
POST   /tts/models/providers/fish-audio/voices             { "referenceId": "...", "name": "..." }
PUT    /tts/models/providers/fish-audio/voices/selection   { "id": "saved-voice-uuid" }
DELETE /tts/models/providers/fish-audio/voices/:voiceId
```

Local models require all of the following:

```dotenv
# COMPOSE_PROFILES must include true (or minio,true when using MinIO).
TTS_LOCAL_KOKORO_82M_ENABLED="true"
TTS_LOCAL_KOKORO_82M_HEALTH_URL="http://localhost:7860/health/ready"
TTS_LOCAL_KOKORO_82M_URL="http://localhost:7860"
```

The exact URLs and profile names for current engines are in
[`local-tts-docker.md`](local-tts-docker.md). A local model is:

- `DISABLED` when its `*_ENABLED` toggle is false;
- `UNAVAILABLE` when enabled but its health check fails;
- `READY` and selectable only when its health check succeeds.

## Add a Fish Audio model

Use this when Fish exposes another model that works with the existing Fish TTS
request format.

1. Confirm the Fish model identifier and request compatibility in the official
   Fish documentation.
2. Add a stable Narrator ID and Fish provider ID to
   `FISH_TTS_MODEL_DEFINITIONS` in
   `src/tts-models/tts-model-registry.service.ts`:

   ```ts
   {
     id: 'fish.example-model',
     providerModel: 'fish-api-model-name',
     displayName: 'Fish Audio — Example Model',
     enabledConfigKey: 'TTS_FISH_EXAMPLE_MODEL_ENABLED',
   }
   ```

3. Add the new toggle, defaulting to `false`, to `.env.example` and this
   document's table.
4. If the API contract differs from the current Fish adapter, add a separate
   adapter instead of adding provider-specific branches to `TtsService`.
5. Add registry/selection tests. Verify `GET /tts/models` hides Fish cards for
   users without a valid key and exposes the enabled card for valid users.

No database migration is required for adding a Fish model definition.

## Add a local model type

Use this when adding a new Docker-hosted engine.

1. Add a Compose service/profile, persistent model cache volume if needed, and
   documented resource requirements in `compose.yaml` and
   `docs/tts/local-tts-docker.md`.
2. Add its `*_ENABLED`, `*_HEALTH_URL`, and `*_URL` settings to `.env.example`.
3. Add a `LocalTtsModelDefinition` to `LOCAL_TTS_MODEL_DEFINITIONS`, including
   a stable ID, the settings above, and the correct health strategy.
4. Implement a narrow `TtsAdapter` in `src/tts/adapters/`. Reuse the existing
   OpenAI-compatible local adapter only when the service truly supports the
   same request and MP3 response contract.
5. Register the adapter ID in `src/tts/tts-adapter-resolver.service.ts` so a
   selected `Audio.modelKey` resolves to that adapter in the worker.
6. Add availability, resolver, and adapter tests; then update this guide and
   the local-Docker guide.

Do not call a model container from the frontend. The browser calls Narrator,
and the worker calls the selected local adapter.

## Request and worker flow

```text
Frontend gets GET /tts/models (including selectedModelId)
  -> user picks a READY model ID
  -> PUT /tts/models/selection saves User.defaultTtsModelKey
  -> POST chapter audio without modelId
  -> BooksService resolves the saved model and checks availability/key state
  -> Audio.modelKey snapshots the resolved ID and a durable job is queued
  -> worker resolves that exact ID through TtsAdapterResolverService
  -> selected adapter generates each text segment
```

A chapter-audio request may include `{ "modelId": "..." }` as a one-request
override. It does not change the saved selection. Changing a saved selection
only affects future audio jobs; queued and completed audio keep their
`Audio.modelKey`. A legacy Fish fallback remains only for users who have not
saved a selection yet.

When a Fish worker begins a chapter, it snapshots the selected voice reference
onto `Audio.voice` before its first chunk. Selecting a different saved voice
later affects only new audio jobs; it cannot make one in-progress chapter mix
voices across chunks or retries.

For a Fish adapter, the worker decrypts only the job owner's key immediately
before the Fish request. For a local adapter, the worker calls the healthy
local Docker service. Neither key nor model catalogue belongs in BullMQ job
data.

## Relevant code map

```text
src/tts-models/
  tts-model-registry.service.ts      static local/Fish definitions + env toggles
  tts-model-availability.service.ts  cached local health checks
  tts-models.service.ts              user-specific GET /tts/models response and selection
  fish-credential.service.ts         encrypted Fish keys + user voice preference
  tts-models.controller.ts           models/key/voice HTTP endpoints

src/tts/
  tts-adapter-resolver.service.ts    model ID -> worker adapter
  adapters/                          one narrow adapter per provider type
  tts.service.ts                     current Fish adapter
```

## Required checks

After changing a catalogue or adapter, run:

```bash
pnpm build
pnpm test --runInBand
pnpm format:check
```

Regenerate the frontend API client after any public endpoint/contract change.

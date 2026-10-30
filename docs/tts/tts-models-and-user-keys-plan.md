# TTS models and user-owned Fish Audio keys plan

## Goal

Add a **Models** page where a signed-in user can see which TTS models are
usable right now and choose one when generating chapter audio.

There will be two model sources:

1. **Local models** — Docker services enabled by the deployment owner. They
   are shared by every user of that deployment.
2. **Fish Audio models** — enabled by the deployment owner, but usable only
   after the individual user saves their own Fish API key.

There is no server-global Fish API key in the completed design. Each Fish
request uses the owning user's encrypted credential.

## Implementation status — October 2026

Implemented in the backend:

- Local Docker catalogue, health checks, and the four initial local adapters.
- `UserTtsProviderCredential` with user-bound AES-256-GCM encryption, safe
  status states, and credential deletion.
- Authenticated `GET /tts/models`, plus throttled Fish credential save/remove
  endpoints. Submitted keys are validated with Fish's wallet endpoint, not a
  synthesis request.
- Fish model cards are included only after the caller has a valid key.
- Queueing persists the selected `Audio.modelKey`; the worker rechecks model
  availability and decrypts only the owning user's key when it must call Fish.
- `User.defaultTtsModelKey`, `PUT /tts/models/selection`, and a Models-page
  picker persist a user's default model for future generation.
- `FishVoice` is a shared durable catalogue: `DEFAULT` rows are synced from
  `FISH_DEFAULT_VOICES`, while `CUSTOM` rows belong to one user.
  `User.selectedFishVoiceId` selects either kind. The sync disables removed
  defaults instead of deleting them; existing audio remains reproducible.

Still to build: an optional per-chapter model override in the book UI, plus
the later voice/reference-selection and multiple-audio-version work.

## Desired user experience

```text
User opens Models page
  |
  +-- Local model enabled and its Docker service is healthy
  |     -> READY, selectable
  |
  +-- Local model enabled but the service cannot answer its health check
  |     -> UNAVAILABLE, dimmed, not selectable, safe reason shown
  |
  +-- Local model disabled in deployment configuration
  |     -> DISABLED, dimmed, not selectable
  |
  +-- Fish models enabled, but user has no valid Fish key
  |     -> show “Add your Fish Audio API key” setup card
  |
  +-- Fish key saved and verified
        -> show enabled Fish models as READY/selectable
        -> show disabled/deprecated Fish entries as UNAVAILABLE/dimmed
```

The Models page is an availability screen, not a source of truth for secrets.
It never receives an API key after the save request completes.

## Important design decisions

### 1. Deployment catalogue is configuration, not a database table

The configured list of model descriptors lives in backend code and environment
configuration. It describes a concrete deployment: model ID, display name,
provider, enabled flag, local endpoint/health check, and adapter.

The database must **not** be the source of truth for whether a Docker container
is currently running. That status changes outside Postgres. The backend creates
the Models-page response by combining:

```text
model registry + deployment flags + cached local health result
               + current user's Fish credential state
```

This prevents a stale DB row from claiming a stopped local container is ready.

The database does persist the things that need durable ownership/history:

- each user's encrypted provider credential;
- each user's nullable saved default model key;
- the exact model key used to create an audio asset;
- safe credential validation timestamps/statuses.

### 2. “Backend guard” here means availability service, not a Nest Guard

Nest guards answer “who is allowed to call this route?”. Local model health is
not authorization. Implement a `TtsModelAvailabilityService` instead:

- checks a local model's health endpoint with a short timeout;
- caches the result briefly (for example 10–30 seconds);
- returns a safe public status/reason;
- is used by the Models read endpoint **and** by the generation workflow.

The user interface is only a hint. Generation must re-check availability on the
server immediately before queuing work, and the worker must resolve it again
before sending a provider request.

### 3. Keep one audio asset per chapter in v1

The current schema has one `Audio` record per `Chapter`. Keep that rule for the
first Models delivery:

- user selects a model before the initial generation;
- the completed audio records the model key that produced it;
- to use another model, the user deletes the old audio and generates again.

Do not turn this into multi-version audio history yet. Supporting several
simultaneous voices/models per chapter is a later `AudioAsset` redesign, not a
requirement for showing/selecting models.

### 4. Voice selection is separate from model selection

Users can save multiple Fish reference IDs as `CUSTOM` `FishVoice` rows; they
are not secrets and are returned only to their authenticated owner alongside
shared `DEFAULT` rows as `providers[0].voices`. The user's
`selectedFishVoiceId` selects either source. Fish requests resolve that
selected enabled value first, then the first enabled deployment default, then
Fish Audio's own default if neither is configured. Narrator must not guess a
preferred voice from the chapter language.

```text
POST   /tts/models/providers/fish-audio/voices             { "referenceId": "...", "name": "..." }
PUT    /tts/models/providers/fish-audio/voices/selection   { "id": "saved-voice-uuid" }
DELETE /tts/models/providers/fish-audio/voices/:voiceId
```

The worker snapshots the selected voice onto `Audio.voice` before its first
chunk. Changing a voice affects future audio jobs, not an in-progress chapter.
A later multi-audio-version design can offer explicit regeneration with a
different voice.

## Model identifiers and configuration

Use stable internal IDs, never a Docker container name or a provider display
label. Examples:

```text
fish.s2.1-pro-free
fish.s2.1-pro
local.piper.en-us-amy
local.kokoro-82m
```

Use explicit environment flags for each supported descriptor. The exact model
names will be finalised when its adapter is added.

```dotenv
# Fish catalogue. These flags only expose/configure a model; they contain no key.
TTS_FISH_S2_1_PRO_FREE_ENABLED="true"
TTS_FISH_S2_1_PRO_ENABLED="false"

# Local catalogue. An enabled model must also have a reachable service URL.
TTS_LOCAL_PIPER_EN_US_AMY_ENABLED="false"
TTS_LOCAL_PIPER_EN_US_AMY_URL="http://localhost:9100"

TTS_LOCAL_KOKORO_82M_ENABLED="false"
TTS_LOCAL_KOKORO_82M_URL="http://localhost:9200"

# Ordered voice fallback list, not credentials. The first item is used when a
# user has no saved voice.
FISH_DEFAULT_VOICES='[
  {"id":"bf322df2096a46f18c579d0baa36f41d","name":"Sarah"},
  {"id":"6264e995072341a281c45ed71e554566","name":"Adrian"}
]'
FISH_TTS_IDLE_TIMEOUT_MS="300000"

# 32-byte base64 secret used only to encrypt credentials stored in Postgres.
TTS_CREDENTIAL_ENCRYPTION_KEY="generate-a-real-32-byte-base64-value"
```

Each `TTS_LOCAL_*_ENABLED` setting is the Docker and backend toggle. Compose
maps `true` values to its active `true` profile, while false values map to an
inactive profile; `COMPOSE_PROFILES` therefore includes `true` once (or
`minio,true` for local storage). Startup configuration must reject an enabled
local model without its URL. The Models endpoint will still report
`UNAVAILABLE` if a properly configured service later stops responding.

For a Docker deployment, the local model gets a service with an env-driven
Compose profile, health check, persistent model-cache volume if required,
CPU/GPU resource documentation, and an internal service URL. A host-run API
instead uses the published `localhost` URL. Document those as two explicit
deployment examples; do not guess the address at runtime.

## Data model

### `UserTtsProviderCredential`

Add a per-user credential model, initially supporting `FISH_AUDIO` only.

```text
id
userId                 foreign key -> User
provider               enum: FISH_AUDIO
encryptedSecret        authenticated encrypted blob, never returned
encryptionKeyVersion   supports future master-key rotation
state                  VALID | INVALID | UNKNOWN
lastValidatedAt        nullable
lastValidationError    nullable safe code only
createdAt
updatedAt

unique(userId, provider)
index(userId, provider)
```

The encrypted blob is needed because the worker must later use the key. A hash
alone cannot work for an API credential. Encrypt with AES-256-GCM (unique random
nonce per write) using `TTS_CREDENTIAL_ENCRYPTION_KEY`; authenticate the
provider and user ID as associated data. Keep the key version alongside it so a
future rotation can re-encrypt rows gradually.

Never store plaintext API keys in `Job`, `Audio`, `AudioChunk`, Redis, logs,
exceptions, Swagger examples, or HTTP responses. Decrypt only in worker memory
at the moment a Fish request is about to be made.

### `User.defaultTtsModelKey`

Add one nullable string field to `User` for the selected default model ID.
It deliberately has no database foreign key because model descriptors are
configuration/code rather than database rows. Validate it against the current
catalogue when saving the preference and again when queueing generation.

Changing this field affects only future generation. The resolved ID is copied
to `Audio.modelKey`, so queued, retried, and finished audio never changes when
a user picks a different default later.

### Existing `Audio` record

Add nullable migration fields first, then make new work populate them:

```text
modelKey        stable catalogue ID, for example fish.s2.1-pro-free
provider        existing field; keep it as the provider that actually ran
voice           existing field; records the resolved voice/reference
```

Old completed audio can retain a null `modelKey`. Do not backfill it by guess.

The generation job stores/reuses the `Audio` record's `modelKey`; it does not
store the Fish key. If a user removes their key while work is queued, the job
fails safely with a credential-required/invalid code rather than using a
deleted or server-global credential.

## Backend module shape

Add a focused `src/tts-models/` module rather than a generic `models/` module.
It owns model discovery, user provider credentials, availability, DTOs, and
safe API contracts.

```text
src/tts-models/
  tts-models.module.ts
  tts-models.controller.ts
  tts-models.service.ts                 # catalogue response + user ownership
  tts-model-registry.service.ts          # static descriptors from config
  tts-model-availability.service.ts      # cached local health checks
  fish-credential.service.ts             # encrypt/decrypt/validate Fish key
  dto/
  contracts/
  exceptions/
  types/
  *.spec.ts

src/tts/
  adapters/
    tts-adapter.ts                       # small concrete adapter contract
    fish-audio.adapter.ts
    local-piper.adapter.ts               # added with the first local model
  tts-adapter-resolver.service.ts
  chapter-tts.service.ts                 # asks resolver for Audio.modelKey
```

An adapter is now justified: Fish and a local HTTP/container model are two
concrete provider contracts. Keep the interface small—synthesize an already
validated text segment and return the same validated audio stream metadata that
the current pipeline uses. Keep segmentation, R2 upload, progress, retry, and
FFmpeg merge unchanged.

## API contract

All routes require `JwtAccessGuard`. Credential mutations also go through the
existing CSRF protection and receive a strict rate limit.

### Read catalogue

`GET /tts/models`

Response is user-specific but contains no secret:

```json
{
  "selectedModelId": "local.piper.en-us-amy",
  "providers": [
    {
      "id": "fish-audio",
      "credentialState": "MISSING",
      "setupRequired": true
    }
  ],
  "models": [
    {
      "id": "local.piper.en-us-amy",
      "provider": "local-piper",
      "displayName": "Piper — English (Amy)",
      "source": "LOCAL",
      "status": "READY",
      "selectable": true,
      "reasonCode": null
    },
    {
      "id": "local.kokoro.en",
      "provider": "local-kokoro",
      "displayName": "Kokoro — English",
      "source": "LOCAL",
      "status": "UNAVAILABLE",
      "selectable": false,
      "reasonCode": "MODEL_SERVICE_UNREACHABLE"
    }
  ]
}
```

When `credentialState` is `MISSING` or `INVALID`, omit Fish model cards and let
the frontend render the "Add your Fish Audio API key" card. When it is `VALID`,
append enabled Fish model cards. A disabled/deprecated descriptor remains
visible only as `UNAVAILABLE`; it is never selectable.

Public model statuses:

```text
READY              configured and usable now
UNAVAILABLE        configured but provider/service cannot be used
DISABLED           intentionally disabled by this deployment
```

Fish credential statuses are separate:

```text
MISSING | VALID | INVALID | UNKNOWN
```

Return stable safe reason codes such as `MODEL_SERVICE_UNREACHABLE` or
`FISH_CREDENTIAL_REQUIRED`, never raw Docker, HTTP, or provider error text.

### Save default model

```text
PUT /tts/models/selection   { "modelId": "local.kokoro-82m" }
```

The endpoint accepts only a currently selectable model, saves its stable ID in
`User.defaultTtsModelKey`, and returns `{ "selectedModelId": "..." }`.
Selecting a Fish model also requires the caller's valid Fish credential. The
frontend refetches the catalogue to show the new selected card.

### Save/remove Fish credential

```text
PUT    /tts/models/providers/fish-audio/credential   { "apiKey": "..." }
DELETE /tts/models/providers/fish-audio/credential
```

- `PUT` encrypts and upserts the credential, then validates it with a small,
  documented Fish request chosen during implementation. Do not synthesize a
  book segment merely to test a key.
- Return only safe configuration state and validation time, never the key or a
  prefix/suffix of it.
- `DELETE` securely removes the credential row. Queued work using Fish may
  then fail safely when the worker reaches it; already in-flight HTTP requests
  cannot be recalled.

### Start generation

The existing chapter-audio generation DTO accepts an optional `modelId`.
Without it, the service uses `User.defaultTtsModelKey`; with it, the request
uses that model only and does not change the saved preference. Before a job is
created, the service verifies ownership, model existence, model readiness, and
the current user's Fish credential state.

For backwards compatibility, a user with no saved preference still gets the
legacy enabled-Fish fallback when they have a valid credential. Remove that
fallback once onboarding makes selection mandatory.

Use stable errors for the frontend:

```text
TTS_MODEL_NOT_FOUND
TTS_MODEL_UNAVAILABLE
FISH_CREDENTIAL_REQUIRED
FISH_CREDENTIAL_INVALID
```

They should be state/configuration failures (normally `409 Conflict`), not
leaked provider failures. Update Swagger/OpenAPI, frontend error translations,
and generated API types together.

## Worker flow after the change

```text
User saves a model selection, then starts chapter generation
  -> Books service loads saved selection (or one-request override)
  -> checks ownership + model availability + Fish credential state
  -> Audio records modelKey; Job is queued (no secret in Redis/DB payload)
  -> worker claims Job
  -> resolve adapter from Audio.modelKey
  -> Fish adapter decrypts that user's key only in process memory
     OR local adapter calls healthy local service
  -> existing chunk -> stream to object storage -> merge -> cleanup flow
  -> Audio records actual provider/model/voice metadata
```

For Fish authentication failures, classify only clearly credential-related
responses as `INVALID`; rate limits, outages, or malformed provider responses
remain normal retryable TTS failures and must not erase a user's credential.

## Implementation sequence

### Phase 0 — lock the first catalogue

1. Choose stable IDs/display labels for the current Fish model and the first
   local Docker model.
2. Write exact config names, service URL, health endpoint, output format, and
   segment-size limits for that local model.
3. Confirm the smallest documented Fish request that can validate a key and
   classify its authentication failure safely.

### Phase 1 — safe schema and credential foundation

1. Add `UserTtsProviderCredential`, provider/state enums, constraints, and a
   migration.
2. Add nullable `Audio.modelKey` and a migration.
3. Implement authenticated encryption, key-version handling, secure delete,
   and redaction tests.
4. Add `TTS_CREDENTIAL_ENCRYPTION_KEY` to the single `.env.example`; remove
   `FISH_AUDIO_API_KEY` and `FISH_TTS_MODEL` from deployment configuration.
   Keep the non-secret timeout/default-voice settings.

### Phase 2 — catalogue and availability read API

1. Create `TtsModelsModule`, registry descriptors, and the availability
   service with bounded timeout/cache.
2. Implement `GET /tts/models` with safe contracts, Swagger, authorization,
   error codes, and tests for each status combination.
3. The first UI can now render local model cards plus the Fish setup card.

### Phase 3 — Fish key setup

1. Add validated, rate-limited `PUT` and `DELETE` credential endpoints.
2. Make the Models response include Fish model cards only for a valid user key.
3. Add frontend form/dialog: submit key once, immediately refetch catalogue,
   never retain the value beyond form submission.

### Phase 4 — generation adapter migration

1. Extract the current `TtsService` into `FishAudioTtsAdapter` without changing
   its stream/R2 behavior.
2. Add the narrow adapter resolver and persist selected `modelKey` on `Audio`.
3. Save/check a selected model on generation, resolve its key at worker
   execution, and remove the server-global Fish API key fallback.
4. Update OpenAPI, run frontend generation, and wire the Models-page selector.

### Phase 5 — first local model

1. Add its Compose profile, named service, health check, documented resource
   needs, URL config, and model data volume if needed.
2. Implement its adapter using the existing streaming contract where possible.
3. Add availability and adapter integration tests. Verify disabled, stopped,
   unhealthy, and healthy service states.

### Phase 6 — hardening and later work

1. Add encryption-key rotation procedure and deployment documentation.
2. Add user quotas/rate limits and provider cost observability.
3. Later: per-user voice/reference selection, multiple audio versions per
   chapter, more Fish adapters, GPU scheduling, SSE model-health updates.

## Test and security checklist

- another user cannot read, replace, delete, or use someone else's Fish key;
- API/OpenAPI responses and generated clients contain no credential field;
- logs, error filters, BullMQ job data, DB records, and test snapshots contain
  no plaintext key;
- invalid/expired Fish key yields the safe setup state, not a raw provider body;
- an enabled-but-unhealthy local model is listed but cannot be selected;
- a health status changes from unavailable to ready after the cache expires;
- generation re-checks readiness after a stale UI response;
- Fish worker requests use only the owning user's decrypted credential;
- existing audio/TTS retry, cancel, delete, streaming, merge, and R2 cleanup
  tests remain green;
- `pnpm build`, `pnpm test`, and `pnpm format:check` pass before the frontend
  consumes the regenerated OpenAPI client.

## Definition of done for the first delivery

1. A user without a Fish key sees an explicit setup card and cannot select Fish.
2. A user with a valid Fish key sees/selects only deployment-enabled Fish models.
3. Healthy local models are selectable for every authenticated user; unhealthy
   or disabled local models are visibly unavailable and blocked server-side.
4. Chapter TTS uses the user's saved default (or an explicit one-request
   override) and the correct user's Fish key.
5. No global Fish API key is required in production configuration.
6. The stored finished audio identifies the model that produced it.

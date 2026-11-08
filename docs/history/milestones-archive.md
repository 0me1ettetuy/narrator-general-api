# Backend milestones archive

Older milestones, moved out of [`../history.md`](../history.md) to keep it short. Same format; append here only when archiving.

### 2 November — independent MinIO Compose switch

- Added a dedicated `MINIO_ENABLED` flag so the MinIO container turns on the
  same way each local TTS model does: via its own flag resolving to the
  active `true` Compose profile. `COMPOSE_PROFILES` is now a fixed `"true"`
  that never changes, instead of a value hand-edited to `"minio,true"`
  whenever local storage was selected.

### 31 October — production-style container runtime

- Added a reusable multi-stage backend image that contains the compiled Nest
  API, standalone worker entry point, runtime dependencies, and ffmpeg for
  chapter-audio merging.
- Expanded default Compose startup from infrastructure-only to Postgres, Redis,
  one-off schema update, API, and worker. API/worker wait for the database
  schema update to complete; MinIO and local TTS engines remain opt-in
  profiles.
- Added a public/internal MinIO endpoint split. Signed URLs retain the
  browser-reachable endpoint while API/worker storage operations use the
  Docker-network endpoint.
- Pinned the repository package-manager declaration to pnpm 10.29.2 so local
  and Docker dependency installation use the same toolchain.
- Added a standalone `compose.dev.yaml` command that extends the shared
  infrastructure/service definitions while running API and worker as Nest
  source watchers in development containers.
- Added a Docker development image stage with ffmpeg, a source bind mount, and
  an isolated container `node_modules` volume. It retains the same `.env`,
  database/Redis volumes, MinIO behavior, and optional local-TTS profiles as
  the default stack.

### 1 November — local Compose build policy

- Set the named local API and MinIO images to Compose's explicit build policy,
  so `docker compose up -d` builds the current checkout instead of first
  attempting to pull `narrator-api:local` or `narrator-minio:local` from a
  container registry.
- Kept the worker on the locally built API image without any registry pull.

### 26–31 August — Nest foundation and persistence

- Created the Nest application, TypeScript path alias, linting, formatting,
  editor settings, configuration module, CORS, validation, request logging,
  and global exception filters.
- Added the first Postgres Compose service and then replaced the initial
  experimental Prisma setup with the Prisma 8 contract, generated contract
  lifecycle, `PrismaModule`, and `PrismaService`.
- Removed the generated Prisma contract artifacts from source control after
  establishing the generation workflow.

### 7 September–12 October — secure browser authentication

- Defined user/auth persistence and safe response contracts, then introduced
  the `AuthModule`, `UsersModule`, password hashing, JWT issue/validation,
  login, registration, refresh, logout, current-user, and CSRF endpoints.
- Added local, access-JWT, and refresh-JWT guards/strategies; refresh-token
  cookie handling; normalized email; access/refresh session services; and
  OpenAPI metadata for auth.
- Corrected CSRF failures to remain HTTP `403` instead of being converted to
  `500`, and introduced stable API error codes and an invalid-credentials
  exception.

### 13–16 October — contracts, documentation, books, and direct upload

- Added backend contribution guidance plus architecture, API-contract, and
  delivery documentation. Generated Prisma contract files became ignored
  local artifacts.
- Added the first `Book`, `Chapter`, `Audio`, and durable job persistence
  model shapes.
- Created the Books and Storage modules. The authenticated books API can list
  user books and create a signed, direct object-storage upload intent; the
  browser uploads an EPUB without passing its bytes through the API server.

### 19–21 October — durable EPUB parsing and chapter audio pipeline

- Added Redis Compose configuration, a BullMQ jobs module, a separate Nest
  worker bootstrap, and queue test mocks.
- Added EPUB spine parsing, ordered cleaned chapter extraction, and the
  background parse processor triggered after the browser confirms an upload.
- Added text segmentation, temporary audio-part persistence, streaming TTS
  output to S3-compatible storage, ffmpeg audio merging, retry-aware worker
  processors, final audio records, progress/status contracts, and direct
  playback URLs.
- Generalized storage configuration from R2 naming to S3-compatible naming,
  and added an optional MinIO local-storage Compose profile.

### 25 October — model catalogue, local engines, and private Fish credentials

- Added Docker/profile definitions and runtime health checks for optional
  Piper, Kokoro, Qwen3-TTS, and Chatterbox local engines.
- Added a model registry and model-list API, TTS adapter abstraction, local
  adapter implementations, resolver logic, safe availability states, and a
  queue-time/worker-time readiness check.
- Added per-user Fish Audio credentials encrypted at rest, save/validate and
  removal endpoints, credential state in the model list, and a per-user saved
  default TTS-model selection. A queued audio record retains its resolved
  model key so retries do not silently change providers.

### 26–28 October — book presentation, curation, and documentation structure

- EPUB parsing now extracts a supported cover, stores it in object storage,
  and persists private cover metadata for the book API.
- Added batch chapter-audio queueing so selected/all eligible chapters can be
  generated in one request.
- Added chapter classification, narration/content tagging, text/title edits,
  merge/delete/reorder curation operations, and the supporting database
  schema, contracts, and tests.
- Reorganized documentation by domain and added model-specific Docker toggles
  so each local engine starts only when its own `*_ENABLED=true` value is set.

### 30 October — Fish voice catalogue and stable voice snapshots

- Added an initial user-owned Fish voice library with authenticated add,
  selection, and deletion endpoints; ownership checks prevent users from
  changing another user's custom voice.
- Replaced the single Sarah/Adrian configuration toggle with the ordered
  `FISH_DEFAULT_VOICES` deployment list. The first enabled configured voice is
  the fallback when a user has no chosen voice.
- Introduced a durable shared `FishVoice` catalogue. It contains both global
  `DEFAULT` voices and user-owned `CUSTOM` voices, while a user's selection can
  point to either. Startup synchronizes configured defaults without deleting
  historical rows; removed configuration entries are disabled instead.
- Chapter generation snapshots the resolved Fish reference ID in `Audio.voice`,
  so later preference or catalogue changes cannot mix voices in an active job
  or its retries.

### 31 October — EPUB language metadata and language-aware local narration

- EPUB parsing now preserves declared BCP 47 book language metadata, persists
  it on `Book`, and exposes it through the book API for the book page.
- The worker passes that language to TTS adapters. Qwen maps BCP 47 values to
  its language names (or `Auto`); Piper selects a male English/Russian voice;
  Kokoro uses a male English voice and explicitly rejects Russian because the
  bundled model has no Russian voice.
- Added the additive nullable database migration, adapter/parser tests, and
  deployment documentation for the language/voice behavior.
- EPUB metadata remains the primary language source. When it is empty, the
  parser now uses `franc` on cleaned chapter text and stores its normalized
  primary language tag as a fallback.

### 31 October — replaceable book covers

- Added authenticated cover-upload intent and confirmation endpoints for ready
  books. The browser uploads the replacement image directly to private
  S3-compatible storage rather than sending its bytes through Nest.
- A replacement overwrites the existing book cover object key. The API checks
  the final object MIME type and size before persisting its metadata and a new
  `updatedAt` value, allowing clients to invalidate their signed-cover cache.
- Books without an EPUB cover use a deterministic custom-cover key on first
  upload; later replacements reuse that same object.

### 31 October — author metadata on library results

- The paginated books response now includes its ordered EPUB author metadata,
  allowing library cards to present authors without fetching every book detail.
- The service uses one bounded author query for the IDs on the current page,
  then groups those rows in memory. This avoids an N+1 query per book while
  keeping pagination unchanged.

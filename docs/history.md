# Backend change history

This is the committed history of `narrator-general-api`, organized into
milestones and backed by a complete chronological commit index. It documents
what entered the repository, rather than the intent suggested by a commit
subject alone.

**Scope:** 26 August–31 October 2026, through commit `fb36b48`.

Uncommitted work is deliberately not recorded here. Add a short milestone and
one row to the index when a future change is committed.

## Milestones

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

## Complete commit index

| Date       | Commit    | Recorded change                                                                                                                           |
| ---------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-26 | `c12a678` | Created the Nest application baseline.                                                                                                    |
| 2026-08-26 | `e0871a2` | Added the TypeScript `@` import alias.                                                                                                    |
| 2026-08-26 | `6814011` | Added formatting, linting, and editor configuration.                                                                                      |
| 2026-08-29 | `f8e8c88` | Added configuration-module setup.                                                                                                         |
| 2026-08-29 | `29a236c` | Added the initial Prisma configuration and schema files.                                                                                  |
| 2026-08-29 | `58ec241` | Added the Postgres Compose service.                                                                                                       |
| 2026-08-29 | `4f69942` | Added global request validation.                                                                                                          |
| 2026-08-30 | `6a2a78a` | Added global exception filters.                                                                                                           |
| 2026-08-30 | `7a50ea6` | Added application logging configuration.                                                                                                  |
| 2026-08-30 | `75c25d9` | Added request-logging middleware.                                                                                                         |
| 2026-08-30 | `319e605` | Added CORS configuration.                                                                                                                 |
| 2026-08-30 | `d615c6f` | Corrected logging setup and removed the first Prisma attempt.                                                                             |
| 2026-08-30 | `1aa02f3` | Wired the Prisma 8 contract/runtime integration.                                                                                          |
| 2026-08-31 | `1d110ae` | Adjusted test/build setup around Prisma generation.                                                                                       |
| 2026-09-07 | `ae1c3ff` | Added authentication dependencies.                                                                                                        |
| 2026-09-07 | `4cd97e9` | Added auth/user schema, DTOs, and response contracts.                                                                                     |
| 2026-09-12 | `2b5e3a1` | Added Auth/Users modules and base services/controllers.                                                                                   |
| 2026-09-22 | `053cc50` | Implemented JWT/CSRF/cookie authentication flow.                                                                                          |
| 2026-09-22 | `b80fa30` | Refined the authentication implementation and persistence wiring.                                                                         |
| 2026-10-06 | `832e7e5` | Added auth OpenAPI metadata and base contract refinements.                                                                                |
| 2026-10-12 | `e5c8227` | Preserved invalid-CSRF responses as `403`.                                                                                                |
| 2026-10-13 | `2d72f29` | Added stable API error codes and invalid-credential handling.                                                                             |
| 2026-10-13 | `0e845d1` | Added backend agent guidance and initial architecture/API docs.                                                                           |
| 2026-10-13 | `80236bf` | Added initial book/chapter/audio/job schema shapes.                                                                                       |
| 2026-10-13 | `c03c3a4` | Ignored generated Prisma contract artifacts.                                                                                              |
| 2026-10-16 | `aafe455` | Added Books and S3-compatible Storage modules.                                                                                            |
| 2026-10-16 | `a6d8ea6` | Added signed EPUB-upload and upload-confirmation endpoints.                                                                               |
| 2026-10-19 | `2d766a9` | Added Redis infrastructure configuration.                                                                                                 |
| 2026-10-19 | `89a30f9` | Added BullMQ jobs foundation and standalone worker bootstrap.                                                                             |
| 2026-10-19 | `5734d2e` | Added EPUB parser service and parser tests.                                                                                               |
| 2026-10-19 | `4400fbe` | Added background EPUB parsing worker flow.                                                                                                |
| 2026-10-19 | `a356aae` | Documented direct-upload lifecycle and updated cookie behavior.                                                                           |
| 2026-10-19 | `8e17390` | Added chapter segmentation and initial TTS module/services.                                                                               |
| 2026-10-19 | `bea8e13` | Added audio chunks, merge service, and synthesis processor.                                                                               |
| 2026-10-19 | `1556e17` | Completed final chapter-audio merge processing.                                                                                           |
| 2026-10-20 | `b7f197c` | Expanded persistent TTS pipeline schema/contracts/workflow.                                                                               |
| 2026-10-20 | `4b90f39` | Streamed Fish audio responses into object storage.                                                                                        |
| 2026-10-20 | `dc3b0e1` | Renamed storage environment configuration for S3 compatibility.                                                                           |
| 2026-10-21 | `23e00a5` | Added optional MinIO local-storage deployment.                                                                                            |
| 2026-10-25 | `260d9ae` | Added local TTS container/model availability foundation.                                                                                  |
| 2026-10-25 | `2749fe2` | Added local TTS adapters and model-aware audio queueing.                                                                                  |
| 2026-10-25 | `941dcc5` | Added encrypted per-user Fish Audio credentials.                                                                                          |
| 2026-10-25 | `d2b796f` | Added saved user TTS-model selection and catalogue docs.                                                                                  |
| 2026-10-26 | `05cf283` | Added EPUB cover extraction and object-storage metadata.                                                                                  |
| 2026-10-26 | `7f37b3a` | Added batch selected/all chapter audio generation.                                                                                        |
| 2026-10-27 | `c1efad6` | Added chapter curation API groundwork and design documentation.                                                                           |
| 2026-10-28 | `d50f899` | Implemented persisted chapter classification and curation actions.                                                                        |
| 2026-10-28 | `eecea24` | Added per-model local-TTS toggles and reorganized docs.                                                                                   |
| 2026-10-30 | `affc5bc` | Added the backend change-history document and linked it from project guidance.                                                            |
| 2026-10-30 | `5904932` | Added a multi-voice Fish library, selection API, and per-chapter voice snapshot.                                                          |
| 2026-10-30 | `a818529` | Replaced the user-only voice list with a safely synchronized default/custom Fish voice catalogue and `FISH_DEFAULT_VOICES` configuration. |
| 2026-10-31 | `fb36b48` | Persisted EPUB language metadata and made Qwen/Piper/Kokoro narration language-aware.                                                       |
| 2026-10-31 | `041ced4` | Added metadata-missing EPUB language detection from parsed chapter text.                                                                     |

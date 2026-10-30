# Narrator General API

## What this service is

Narrator is a modular Nest API with a separate Nest worker process:

```text
React frontend → Nest API → PostgreSQL
                     │
                     └→ Redis/BullMQ → Nest worker → TTS providers / S3 storage
```

Keep this a modular monolith. Long-running EPUB parsing and TTS work belongs in
the durable job/worker flow, never in an HTTP request handler.

## Main commands

```bash
pnpm build
pnpm test --runInBand
pnpm format:check
pnpm exec prisma db update
pnpm start:dev
pnpm worker:dev
```

Start local infrastructure with:

```bash
docker compose up -d db redis
```

Do not leave development servers, workers, or Compose services running after a
task unless explicitly requested.

## Contracts and generated files

- `src/prisma/contract.prisma` is the database schema source of truth.
- `src/prisma/contract.json` and `src/prisma/contract.d.ts` are generated and
  ignored. Never edit or commit them.
- API DTOs, response contracts, and Swagger decorators are the source of the
  OpenAPI contract at `/openapi-json`.
- After a backend API change, regenerate the frontend client in `narrator-fe`
  with `pnpm api:generate`.
- Use explicit DTOs and stable `API_ERROR_CODES`; do not expose ORM rows.

## Book and audio workflow

1. The API creates a book upload intent and returns a signed object-storage URL.
2. The browser uploads the EPUB directly to storage, then confirms the upload.
3. The API stores a parsing job in Postgres and queues it in BullMQ.
4. The worker parses ordered chapters, extracts a supported EPUB cover when
   available, saves its bytes to `books/{userId}/{bookId}/cover/` in object
   storage, and saves cleaned chapter text plus private cover metadata in
   Postgres.
5. `POST /books/:bookId/chapters/:chapterId/audio` creates/resumes one durable
   chapter-audio job and returns `202`.
6. The worker segments chapter text, stores completed temporary MP3 parts in
   object storage, merges them with ffmpeg, saves final audio, then cleans up
   temporary parts.

Audio/job state is persisted so the frontend can recover after reload. The
book-detail endpoint exposes chapter audio status and progress.

## TTS adapters and models

`src/tts/adapters/` contains the narrow shared TTS adapter interface and local
adapters for Piper, Kokoro, Qwen3-TTS, and Chatterbox. `TtsAdapterResolverService`
selects the adapter once per worker job:

- Choose a ready model with `PUT /tts/models/selection`. It stores the user's
  nullable `defaultTtsModelKey` preference. `GET /tts/models` returns it as
  `selectedModelId`.
- Chapter-audio requests can omit `modelId` and use that saved preference, or
  include it for a one-request override. The resolved ID is persisted as
  `Audio.modelKey`; a retry cannot silently switch providers or voices.
- Local model health is checked both while queueing and immediately before the
  worker generates audio.
- Fish keys belong to a user, are AES-256-GCM encrypted in Postgres, and are
  decrypted only in worker memory immediately before a Fish request. Never
  use or add a global Fish API key to the server environment.

`GET /tts/models` returns local model status, `selectedModelId`, and the
current user's safe Fish credential state (`MISSING`, `VALID`, `INVALID`, or
`UNKNOWN`). Fish model cards appear only for a valid key. The API never returns
the key, even partly. Use `PUT /tts/models/providers/fish-audio/credential` to
save/validate it and `DELETE /tts/models/providers/fish-audio/credential` to
remove it. Set the deployment secret `TTS_CREDENTIAL_ENCRYPTION_KEY` to the
output of `openssl rand -base64 32` before users can save credentials.

Local engines are opt-in through their matching `*_ENABLED=true` value in
`.env`. Keep `COMPOSE_PROFILES=true` (or `minio,true` with MinIO): Compose then
starts only the models whose own flag is true. Each enabled model also requires
its health and synthesis URLs. See `docs/tts/local-tts-docker.md` for hardware
requirements, model IDs, and examples.

## Guardrails

- Keep access-token auth, refresh-cookie handling, CSRF, CORS, validation,
  throttling, and ownership checks intact.
- Store binary files in configured S3-compatible object storage and metadata in
  Postgres.
- Do not log credentials, cookies, bearer tokens, source chapter text, or raw
  provider errors.
- Do not commit generated artifacts or secrets.

## Further reading

- `AGENTS.md` — required backend conventions and delivery checklist.
- `docs/README.md` — documentation index and domain map.
- `docs/features/README.md` — cross-repository feature catalogue and current
  feature boundaries.
- `docs/history.md` — chronological backend milestones and full committed
  change index.
- `docs/architecture/backend-architecture.md` — module and worker boundaries.
- `docs/api/api-contracts-and-errors.md` — OpenAPI/error requirements.
- `docs/tts/local-tts-docker.md` — local model deployment and selection.
- `docs/tts/tts-model-catalogue.md` — source of truth, toggles, and steps for
  adding a local or Fish model.
- `docs/tts/tts-models-and-user-keys-plan.md` — model/key design and follow-up
  work.
- `docs/books/chapter-curation-plan.md` — EPUB chapter classification, editing,
  and narration-selection design.

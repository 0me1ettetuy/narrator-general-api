# Narrator backend instructions

This file governs work in `narrator-general-api`. Read it before changing
backend code. For the detailed conventions and checklist, start at
[Backend documentation](docs/README.md), then read:

- [Backend architecture](docs/architecture/backend-architecture.md)
- [API contracts and errors](docs/api/api-contracts-and-errors.md)
- [Backend delivery checklist](docs/architecture/backend-delivery-checklist.md)
- [Container deployment](docs/architecture/container-deployment.md) when
  changing Docker, Compose, deployment environment, or runtime services.
- [TTS model catalogue maintenance](docs/tts/tts-model-catalogue.md) when
  adding, configuring, or changing local/Fish TTS models.
- [Feature catalogue](docs/features/README.md) when identifying existing
  product behavior or a feature boundary.
- [Change history](docs/history.md) when tracing when and how an existing
  capability entered the backend.
- [Book and audio workflow](docs/books/book-and-audio-workflow.md) when
  changing upload, parsing, deletion, sharing, collections or chapter audio.
- [TTS runtime rules](docs/tts/tts-runtime-rules.md) when changing model
  selection, queues, Fish keys/voices or Silero TTS.

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

For the production-style full backend stack, see
[container deployment](docs/architecture/container-deployment.md). It runs
Postgres, Redis, API, worker, and enabled optional services with
`docker compose up -d --build`.

For API/worker watchers inside Docker, run the standalone development setup:

```bash
docker compose -f compose.dev.yaml up -d --build
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

## Guardrails

- Keep access-token auth, refresh-cookie handling, CSRF, CORS, validation,
  throttling, and ownership checks intact.
- Store binary files in configured S3-compatible object storage and metadata in
  Postgres.
- Do not log credentials, cookies, bearer tokens, source chapter text, or raw
  provider errors.
- Do not commit generated artifacts or secrets.

## Core principles

- Use the **API-review** skill for API-contract, authentication,
  authorization, error, DTO, OpenAPI, or frontend/backend boundary work.
- Use the **architecture-review** skill when adding modules, persistence
  boundaries, queues/workers, storage, or other runtime components.
- Keep a modular Nest monolith. Add a new domain module before adding a new
  service/process. Do not create microservices, repository wrappers, event
  buses, or generic abstractions without a current, concrete need.
- Apply SOLID, KISS, and DRY with judgment: controllers have one HTTP-facing
  responsibility; services own domain workflows; utilities stay narrow;
  duplicate only when an abstraction would obscure the domain.
- Preserve existing user work. Do not weaken auth, CSRF, CORS, validation,
  throttling, security headers, or error handling as a shortcut.

## Structure and Nest conventions

- Organize by domain under `src/<domain>/`, not by global technical folders.
  A domain may contain its module, controller, service, DTOs, contracts,
  exceptions, guards/strategies, types, and narrow utilities.
- Controllers translate HTTP to a service call: extract validated DTOs and
  authenticated context, declare guards/Swagger metadata, and return an
  explicit response contract. Keep business rules and database orchestration
  out of controllers.
- Services own domain behavior, authorization checks, transactions, and
  persistence orchestration. Depend on Nest providers through constructor
  injection.
- Put request validation in DTOs with `class-validator`. The global
  `ValidationPipe` already transforms, whitelists, and rejects unknown fields;
  never accept untyped request bodies or expose ORM/database models directly.
- Use explicit safe response contracts/types. Never return `passwordHash`,
  refresh-token data, internal provider errors, or raw database records.
- Follow the existing ESM convention: relative runtime imports use `.js`.

## Persistence and Prisma

- `src/prisma/contract.prisma` is the database schema source of truth.
  `contract.json` and `contract.d.ts` are generated; never hand-edit them.
  They are intentionally Git-ignored and generated locally by lifecycle
  scripts after install and before build/start/test. Run `pnpm contract:emit`
  manually only when the editor needs refreshed types immediately. Commit the
  schema and migration files/snapshots, never these generated artifacts.
- Access the database through `PrismaService`; do not create ad-hoc clients or
  put SQL/database access in controllers.
- Define ownership, unique constraints, foreign keys, indexes, defaults, and
  timestamps in the schema—not only in application code.
- Use a transaction whenever several writes must succeed/fail as one business
  action. Make externally retried actions idempotent with a unique key or an
  explicit state check.
- Keep storage identifiers/URLs and metadata in Postgres; keep binary payloads
  in object storage when that feature is added.

## REST, OpenAPI, and frontend contract

- REST + OpenAPI is the API boundary. Add Swagger decorators for each public
  endpoint: tag, operation, auth, request DTO, successful response, and
  meaningful error responses.
- Shape responses for consumers, not persistence tables. Prefer additive
  contract changes; coordinate intentional breaking changes explicitly.
- Use HTTP status semantics: `200` reads/updates, `201` creation, `202` for
  accepted asynchronous jobs, `204` only for no-body success, and accurate
  `4xx`/`5xx` failures.
- `/openapi-json` is consumed by the frontend’s `pnpm api:generate` command.
  Any contract change requires coordination with the frontend generated client
  and its TanStack Query usage.
- Use pagination/filter/sort DTOs for collection endpoints once a collection
  can grow. Validate bounds and make ordering explicit.

## Errors and localization boundary

- Error responses have the stable shape `{ statusCode, timeStamp, code,
  message }`. Keep this behavior in the global exception filters.
- Add a stable code to `API_ERROR_CODES` in `src/global-filters/api-error.ts`
  for every user-relevant failure that needs distinct client behavior.
- Throw a Nest HTTP exception or focused domain exception with that `code`.
  The server `message` is diagnostic/fallback text only; never include secrets
  or implementation details.
- Do not localize backend messages. The frontend maps `code` through
  `shared/api/api-error.ts` and its English/Russian translations. Coordinate a
  new code with that mapping and both locales.
- Preserve real middleware HTTP statuses—especially CSRF `403`—rather than
  converting them to `500`.

## Authentication and authorization

- Access tokens are bearer tokens; refresh tokens stay in the configured
  HttpOnly cookie. Do not return a refresh token in JSON or logs.
- Every state-changing browser request is subject to the global CSRF
  middleware. Preserve the CSRF refresh lifecycle when changing auth/cookies.
- Protect user-scoped endpoints with `JwtAccessGuard` unless they are
  intentionally public. Authenticate in guards, then authorize ownership in
  the service/query using the authenticated user ID—never a user ID supplied
  by the client.
- Keep passwords, tokens, cookie values, authorization headers, and sensitive
  request bodies out of logs, exceptions, test snapshots, and Swagger examples.
- Rate-limit authentication and expensive operations. Use stricter endpoint
  limits where abuse cost is higher.

## Async work and external systems

- HTTP requests start short work only. Parsing, TTS, imports, exports, and
  other long-running work must use a durable job record/queue and a worker.
- Persist enough job state for the UI to recover after reload: status,
  progress, owner/resource, attempts, timestamps, and safe failure code.
- Make workers retry-safe and idempotent. Store final external output before
  marking the database record complete; never let duplicate delivery create
  duplicate user-visible records.
- Put external provider/object-storage code behind a narrow domain adapter.
  Validate timeouts, input/output size, and provider failures at that boundary.

## Tests and quality

- Add focused unit tests beside the module (`*.spec.ts`) for services, domain
  exceptions, and edge cases. Add e2e coverage for critical HTTP/auth flows.
- Cover authorization (another user cannot access data), validation, stable
  error codes/statuses, retry/idempotency, and failure paths—not only happy
  paths.
- For relevant changes, run:

  ```bash
  pnpm build
  pnpm test
  pnpm format:check
  ```

- `pnpm lint` currently runs ESLint with `--fix`; run it only when write
  changes are intended, then inspect the diff. Use the formatter deliberately
  for targeted files rather than mass-formatting unrelated code.
- Do not leave a server, watch process, worker, or Docker stack running unless
  explicitly requested. If one remains active, report its command, port, and
  stop command.

## Definition of done

A task is done only when all of these hold:

1. The code works: `pnpm build`, `pnpm test` and `pnpm format:check` pass.
2. Docs are synced: each affected doc is updated using the routing table in
   [`docs/README.md`](docs/README.md), and every new doc is linked from its
   folder README.
3. `docs/history.md` has an entry (short unique title, no hash) under "Recent
   changes", written before the commit.
4. Every doc you touched is within the size budget in `docs/README.md`; if one
   is over, split it before finishing.
5. No server, worker or Compose stack you started is left running.

## Documentation rules

Docs are a tree: this file links `docs/README.md`, whose routing table says
what every doc holds and when to edit it. Before adding or editing a doc, read
the rules at the top of `docs/README.md` (where facts go, how to create a
note, size budget, status tags).

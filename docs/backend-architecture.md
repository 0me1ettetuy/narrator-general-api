# Backend architecture

## System shape

Narrator is a frontend plus one Nest API backed by PostgreSQL. Keep the API a
**modular monolith**: domains are isolated in code, but ship together. Add a
separate worker process only for durable asynchronous work such as parsing,
TTS, import, or export.

```text
React frontend → Nest HTTP API → PostgreSQL
                        │
                        ├── Swagger/OpenAPI → generated frontend client
                        └── durable queue/worker → external providers or storage
```

This shape keeps the current deployment simple while making slow work durable
and independently controllable. Do not introduce microservices until a domain
has an independently scaling runtime, an isolated owner, or a real reliability
boundary that a module/worker cannot meet.

## Module ownership

```text
src/
  auth/             authentication, sessions, cookies, token strategies
  users/            user persistence and safe-user mapping
  prisma/           database lifecycle and generated contract integration
  global-filters/   API-wide error normalization
  <domain>/         controller, service, DTOs, contracts, types, tests
```

A new domain module should look approximately like this when those concerns
exist:

```text
src/books/
  books.module.ts
  books.controller.ts       # HTTP, Swagger, guards, DTO extraction
  books.service.ts          # domain workflow and authorization
  dto/
  contracts/                # consumer-facing response types/OpenAPI classes
  exceptions/
  types/
  utils/                    # only narrow domain helpers
  books.service.spec.ts
```

Avoid global `services/`, `utils/`, or `types/` folders that mix domains.
Avoid a repository layer that only forwards calls to Prisma; add one only when
it contains a meaningful persistence boundary shared by multiple services.

## Request lifecycle

```text
HTTP request
  → CORS / cookie parser / CSRF / Helmet / throttling
  → global ValidationPipe
  → controller + DTO + guards
  → domain service + authorization
  → PrismaService / external adapter
  → explicit response contract
  → global exception filter if failure
```

Controllers should be intentionally thin. A service receives a validated input
and trusted authenticated context, applies the domain rules, performs any
transaction, and returns a safe contract-oriented result.

## Persistence rules

`src/prisma/contract.prisma` defines the schema. Its generated JSON and TypeScript
contract files are implementation artifacts. Update the schema first, then
regenerate the contract.

Model invariants in the database whenever possible:

- foreign keys describe ownership and relationships;
- unique constraints protect idempotent operations and natural uniqueness;
- indexes support frequent filter/order patterns;
- timestamps record lifecycle transitions;
- transactions protect multi-record workflows.

Services must scope user-owned reads/writes by the authenticated actor. A
controller parameter is never proof that the caller owns that resource.

## Background processing

Do not make a browser wait for slow work. A correct asynchronous workflow has:

1. an API action that validates/authenticates and creates a persisted job;
2. a quick `202 Accepted` response containing enough state for the UI;
3. a worker that claims, processes, retries, and records terminal status;
4. an ordinary read endpoint that exposes job/resource state after reload;
5. idempotency so duplicate clicks or queue delivery cannot duplicate output.

For binary-heavy work, persist metadata and private object keys in Postgres;
store the binary in object storage. The database update to `READY` must happen
only after the final object has been written successfully.

## Security boundaries

- Guards establish identity; services establish permission/ownership.
- DTOs validate transport input; services validate business rules.
- Global exception filters establish the error envelope.
- Object-storage/provider adapters establish timeouts, size limits, and secret
  handling.
- Configuration is supplied through environment variables/`ConfigService`,
  never hard-coded credentials.

## Observability

Use Nest `Logger` with a clear domain/context. Log useful identifiers such as
request ID, user ID when appropriate, resource ID, and job ID, but never
credentials, cookies, JWTs, passwords, authorization headers, or source text
that may be sensitive. Record duration and safe failure code for expensive
external calls.

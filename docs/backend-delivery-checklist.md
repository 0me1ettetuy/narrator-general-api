# Backend delivery checklist

Use this checklist for every meaningful backend change.

## Before coding

- Read `AGENTS.md` and select the API-review and/or architecture-review skill
  when their trigger applies.
- Identify the owning domain module and whether the change is synchronous or
  must be a durable background job.
- Inspect the existing OpenAPI contract, DTOs, service behavior, auth rules,
  error codes, and frontend consumer before changing a public endpoint.
- Prefer the smallest additive change that meets the use case.

## Domain and persistence

- Put HTTP concerns in a controller and domain behavior/authorization in a
  service.
- Add DTO validation for all client input; use explicit safe response types.
- Scope user-owned data by authenticated user ID in the service/query.
- Update `contract.prisma` for schema changes, then run `pnpm contract:emit`.
  Never manually edit generated Prisma contract artifacts.
- Add constraints/indexes/transactions/idempotency appropriate to the data
  invariant and retry behavior.

## HTTP, OpenAPI, and errors

- Use a meaningful HTTP status and document success/errors in Swagger.
- Update the OpenAPI DTO/response classes when the schema changes.
- Return stable `{ code, statusCode, message }` errors through global filters.
- Add a new `API_ERROR_CODES` entry for distinct client-visible errors, then
  coordinate frontend `api-error.ts` and English/Russian translations.
- Do not expose raw exception, database, provider, or secret data.

## Security and external work

- Apply the correct guard and check ownership/role in the service.
- Preserve CSRF for browser mutations, HttpOnly refresh cookies, CORS,
  validation, throttling, and Helmet.
- Keep secrets in environment/configuration, never code/logs/tests.
- For slow/external work, return `202`, persist job state, use a worker, set
  retry/timeout behavior, and make the result idempotent.

## Tests and verification

- Add/adjust service tests for rules and error paths.
- Add controller/e2e coverage for request validation, status, response shape,
  auth, ownership, and critical CSRF/cookie behavior.
- Run:

  ```bash
  pnpm build
  pnpm test
  pnpm format:check
  ```

- `pnpm lint` runs with `--fix`; use it deliberately and inspect all edits.
- If OpenAPI changed, have the frontend regenerate its client and build before
  considering the contract complete.
- Stop any server, watch process, worker, or Docker stack you started unless
  explicitly asked to leave it running.

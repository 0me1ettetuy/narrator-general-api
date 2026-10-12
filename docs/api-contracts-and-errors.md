# API contracts and errors

## Contract ownership

Nest controllers, DTOs, response contract classes, and Swagger decorators are
the source of the HTTP contract. The OpenAPI document is served at
`/openapi-json`; the frontend uses it to generate its typed Hey API/TanStack
Query client.

Treat a backend contract change as a coordinated frontend change:

```text
DTO/controller/Swagger update
  → backend build and endpoint tests
  → /openapi-json
  → frontend pnpm api:generate
  → frontend query/mutation and UI update
```

Do not expose Prisma/database records by accident. Define request DTOs and
safe response contracts for consumers. Prefer additive fields and endpoints
over breaking existing clients.

## Controller contract checklist

Every endpoint should declare what a consumer needs to know:

- `@ApiTags` and `@ApiOperation`;
- authentication/cookie/bearer requirements;
- DTO body/query/param validation;
- success response type and HTTP status;
- meaningful expected errors;
- rate limit for sensitive or costly operations.

Use resource-oriented routes for ordinary CRUD. A narrow action endpoint is
appropriate when it represents a domain command, such as `/auth/refresh` or
`POST /books/:id/audio`.

## Status codes

| Situation | Status |
| --- | --- |
| Read or successful update | `200` |
| Created resource/session | `201` |
| Queued long-running work | `202` |
| Successful no-content removal | `204` |
| Invalid input | `400` |
| Missing/invalid authentication | `401` |
| Authenticated but forbidden, including invalid CSRF | `403` |
| Resource absent or intentionally hidden | `404` |
| State/uniqueness conflict | `409` |
| Rate limited | `429` |
| Unexpected server failure | `500` |

## Error envelope

All errors pass through global filters and have this stable shape:

```ts
{
  statusCode: number;
  timeStamp: string;
  code: ApiErrorCode;
  message: string | string[];
}
```

`code` is the presentation-safe contract. `message` is only a diagnostic
fallback and must not contain secrets or internals. The frontend never renders
it directly.

### Adding a domain error

1. Add an uppercase stable code to `API_ERROR_CODES` in
   `src/global-filters/api-error.ts`.
2. Throw a focused Nest HTTP exception (or small domain exception) with
   `{ code, message }`.
3. Add relevant Swagger error documentation and service/controller tests.
4. Coordinate the frontend update: map the code in `shared/api/api-error.ts`
   and add English/Russian translations.

Example:

```ts
throw new ConflictException({
  code: API_ERROR_CODES.emailAlreadyRegistered,
  message: 'Email is already registered',
});
```

Keep security-sensitive errors intentionally broad—authentication failures
should not reveal whether an account, token, or session exists.

## Auth and browser requests

- Protected resource endpoints use bearer access tokens and `JwtAccessGuard`.
- Refresh tokens are HttpOnly cookies and are checked/rotated server-side.
- Browser mutations are protected by CSRF middleware. A refresh-cookie rotation
  changes the CSRF binding, so the frontend must renew its CSRF token afterward.
- Services still enforce ownership after the guard resolves the user. Never
  authorize solely from a client-supplied ID/path parameter.

## Validation and collections

DTOs are the HTTP boundary. Use `class-validator` rules for every externally
supplied field, including query filters, sorting, IDs, pagination, and file
metadata. Keep validation messages safe, but use a stable error code for client
localization.

When a collection can grow, define explicit query parameters for pagination,
filters, and allowed sort fields. Return enough metadata for the client to
navigate without relying on hidden defaults.

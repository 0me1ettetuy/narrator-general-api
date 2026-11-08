# Typed frontend/backend contract and product foundations

These are developer-facing foundations, not separate buttons in the product,
but they make the features above reliable to evolve.

- The backend exposes Swagger/OpenAPI at `/openapi-json`, uses explicit DTOs
  and response contracts, global validation, CORS/Helmet, consistent error
  shape (`statusCode`, `timeStamp`, `code`, `message`), request logging, and
  Prisma migrations/schema as the durable data contract.
- The frontend uses Hey API to generate its OpenAPI TypeScript client and
  TanStack Query query/mutation helpers. Generated output is intentionally
  ignored; regenerate it after an API contract change rather than editing it.
- Page data uses TanStack Query cache invalidation after mutations. Forms use
  TanStack Form and Zod. Shared shadcn primitives provide the accessible base
  UI, while page-specific book/model/curation behavior stays in page slices.
- API error codes, not raw backend messages, are localized by the frontend.

## Contributing commits, checked by actual change

- Backend foundation: `c12a678`, `e0871a2`, `6814011`, `f8e8c88`, `29a236c`,
  `58ec241`, `4f69942`, `6a2a78a`, `7a50ea6`, `75c25d9`, `319e605`,
  `d615c6f`, `1aa02f3`, `1d110ae`, `c03c3a4`, and `0e845d1` established the
  Nest/Prisma/Compose/validation/error/logging/OpenAPI/documentation baseline.
- Frontend foundation: `f16cfad`, `e46d329`, `2a6e987`, `b2c45b2`, `243ba38`,
  `fd2bf63`, `13eafed`, `9485e03`, `950624c`, `3467471`, `a111cf2`,
  `a9df164`, `2631008`, `6a328a8`, and `cbbf7e8` established the Vite,
  styling/tooling, shadcn, TanStack Query/Router, generated-client, FSD, and
  project-documentation baseline.

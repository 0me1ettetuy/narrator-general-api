# Container deployment

The backend repository owns the production-style runtime: PostgreSQL, Redis,
the API, the worker, optional MinIO, and optional local TTS models.

## First start

1. Copy `.env.example` to `.env` and replace every placeholder.
2. Keep `NODE_ENV="development"` for a local HTTP installation. Set it to
   `production` only behind HTTPS, because authentication cookies are secure
   in production mode.
3. Start the application:

   ```bash
   docker compose up -d --build
   ```

Compose first starts PostgreSQL, runs the one-off `migrate` container, then
starts the API and worker. `migrate` executes the current Prisma
`db update` contract command against the persistent Postgres volume. Existing
data is retained; it is not reset by `docker compose down`.

The API is published on `API_PUBLISHED_PORT` (default `3000`).

## Updating

```bash
git pull
docker compose up -d --build
```

When the backend image changes, Compose recreates `migrate`, which applies the
updated database contract before the API and worker start. Review and back up
production data before deploying any schema change that may remove or reshape
data.

## Optional profiles

The default starts the complete backend. Profiles only enable optional local
services:

- `minio` for local object storage.
- `true` for each local TTS model whose individual
  `TTS_LOCAL_*_ENABLED="true"` flag is set.

The commented MinIO section in `.env.example` sets
`COMPOSE_PROFILES="minio,true"` and provides the required container-only
`STORAGE_INTERNAL_ENDPOINT`. The browser continues to use the public
`STORAGE_ENDPOINT` in signed URLs; API and worker use the internal endpoint.

## Development

For host-run API/worker watchers, start only infrastructure instead of the
full Compose application:

```bash
docker compose up -d db redis
pnpm start:dev
pnpm worker:dev
```

Add `minio` or a local TTS profile through `.env` when needed. After a schema
change during a running development session, run `pnpm exec prisma db update`.

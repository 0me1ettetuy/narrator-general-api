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

The commented MinIO section in `.env.example` sets `MINIO_ENABLED="true"`
and provides the required container-only `STORAGE_INTERNAL_ENDPOINT`.
`COMPOSE_PROFILES="true"` stays fixed regardless. The browser continues to
use the public `STORAGE_ENDPOINT` in signed URLs; API and worker use the
internal endpoint.

## Development

For watcher containers, use the dedicated development Compose definition:

```bash
docker compose -f compose.dev.yaml up -d --build
```

It loads the same `.env`, infrastructure, persistent data volumes, MinIO
selection, and local-TTS profiles as the normal Compose definition. Its only
runtime difference is that API and worker mount the local source directory and
run `pnpm start:dev` / `pnpm worker:dev`. Saving backend code restarts the
matching Nest process inside its still-running container.

For host-run API/worker watchers instead, start only infrastructure:

```bash
docker compose up -d db redis
pnpm start:dev
pnpm worker:dev
```

When `STORAGE_PROVIDER="minio"`, start the MinIO services explicitly as well:

```bash
docker compose up -d minio minio-init
```

Likewise, start an enabled local-TTS service by name (for example,
`docker compose up -d piper-tts`). The development Compose stack performs a
schema update on startup; after a schema change in an already-running session,
run:

```bash
docker compose -f compose.dev.yaml exec api pnpm exec prisma db update
```

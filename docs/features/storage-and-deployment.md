# Storage and self-hosted deployment choices

## What it is

The same storage adapter supports Cloudflare R2, Amazon S3, and local MinIO.
Binary EPUBs, covers, temporary audio parts, and final MP3s live in object
storage; Postgres stores metadata and object keys.

## How an operator uses it

- For R2, set `STORAGE_PROVIDER=r2` with its endpoint, region, bucket, and
  credentials.
- For Amazon S3, set `STORAGE_PROVIDER=s3`, AWS region/bucket/credentials, and
  leave `STORAGE_ENDPOINT` empty so the AWS SDK chooses AWS's endpoint.
- For a local/open-source deployment, set `STORAGE_PROVIDER=minio`, configure
  the local credentials, and set `MINIO_ENABLED=true`. Compose starts MinIO
  and an init container creates the bucket.
- Enable only needed local TTS model flags; their persistent volumes preserve
  downloaded weights across container restarts.

## What happens underneath

- The storage adapter uses one S3 client for API/worker object operations and a
  second client only for signed browser URLs. They normally share an endpoint;
  MinIO can use `STORAGE_INTERNAL_ENDPOINT=http://minio:9000` internally while
  signed URLs keep the browser-reachable `STORAGE_ENDPOINT`.
- Docker Compose includes Postgres, Redis, a one-off schema-update service,
  the compiled API, and the compiled separate worker by default. MinIO and
  local TTS services remain optional profiles. Compose supplies local-model
  service names to API/worker rather than relying on `localhost`.

## Contributing commits, checked by actual change

- Backend: `58ec241` introduced database Compose setup; `aafe455` introduced
  the storage adapter; `dc3b0e1` generalized R2-specific environment naming to
  provider-neutral storage settings; `23e00a5` added MinIO Docker setup.
- `260d9ae`, `eecea24`, and `fb36b48` supply the optional local TTS Docker,
  model-toggle, and language-aware voice behavior described above.

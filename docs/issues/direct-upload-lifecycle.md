# Direct EPUB upload lifecycle: deferred work

## Status

Deferred product/backend work. The direct browser-to-R2 upload flow works, but
it needs cancellation, retry, and abandoned-upload cleanup before it is a
complete user experience.

## Current flow

```text
Frontend → POST /books/uploads
         → API creates Book(parseStatus = UPLOADING)
         → API returns a 15-minute R2 presigned PUT URL

Frontend → PUT EPUB directly to R2
Frontend → POST /books/:bookId/upload-complete
         → API verifies the R2 object
         → API marks the Book QUEUED and creates the parse Job
```

The API intentionally cannot observe progress while the browser uploads
directly to R2. While the page is open, only the frontend knows whether its
single `PUT` request is still running. After a refresh, browser close, or
network failure, the backend only sees an `UPLOADING` Book.

The signed URL is accepted for 15 minutes. R2 validates that expiry when a
request starts; a request that began before expiry can still finish afterward.

## Observed failure

A missing R2 CORS policy caused the browser upload request to fail after the
API had already created an `UPLOADING` Book. This leaves a visible Book record
without a confirmed object or parse job.

The R2 bucket CORS policy must allow the frontend origin, `PUT`, and all
browser request headers used by the signed URL. The current presigned URL also
requires checksum-related headers; after CORS is fixed, confirm that the
browser request supplies them or change presigning so they are not required.

## Desired user behavior

For an `UPLOADING` Book, show a clear incomplete-upload state with:

- **Retry**: obtain a fresh signed URL and upload again.
- **Delete**: remove the incomplete Book and its source object when present.

Do not claim that the API knows whether an unseen browser upload is still
running. Treat an unconfirmed upload as potentially in progress until the
grace period has elapsed.

## Delete/cancel race cases

### User deletes a record after a failed upload

Delete the `UPLOADING` Book. There may be no R2 object, which must be an
idempotent success case.

### User deletes while the browser R2 PUT is still running

The frontend should abort its `fetch` with `AbortController` when possible.
An already-sent R2 PUT can still finish. If the Book has been removed, the
later `POST /books/:bookId/upload-complete` must return `404`; the frontend
must interpret that as an expected cancellation and must not retry or show a
generic upload error. No parse job must be created.

The completed R2 object can be orphaned if the direct PUT wins this race.

### User deletes after parsing has been queued or started

This is a separate cancellation design. Queue removal, worker cooperation,
and safe cleanup of partially created Chapter/Audio data are required. Do not
reuse the simple `UPLOADING` deletion behavior for `QUEUED` or `PROCESSING`
Books.

## First implementation plan

1. Add an authenticated, ownership-scoped delete/cancel endpoint for
   `UPLOADING` Books and a corresponding Library action.
2. Add client-side abort support for the R2 `PUT`.
3. Treat an upload-complete `404` caused by local cancellation as cancelled.
4. Add a fresh-upload-URL retry path.
5. Add a periodic cleanup task to the existing worker process, not a new
   worker service. It should examine `UPLOADING` Books older than a safe grace
   period (initially one hour) and remove the object plus record.
6. Make cleanup/delete idempotent and race-safe. In particular, it must claim
   or mark an eligible Book before external deletion so an `upload-complete`
   request cannot queue it concurrently. The current Book status enum has no
   cancellation/deletion state, so decide on a small durable marker/status
   before implementing this step.

Running cleanup daily is acceptable for the first version, although an hourly
schedule better matches the one-hour eligibility threshold. It must be safe
to run more than once and safe when the R2 object is already absent.

## Out of scope for this ticket

- Resumable/multipart uploads and server-side upload-progress tracking.
- Cancelling `QUEUED`, `PROCESSING`, or future TTS jobs.
- A general object-storage orphan scanner. The first cleanup is driven by
  known stale `UPLOADING` Book records.

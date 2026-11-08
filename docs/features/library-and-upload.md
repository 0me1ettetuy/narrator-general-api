# EPUB library and direct upload

## What it is

The library accepts an EPUB, creates a book record, uploads the source directly
to object storage, and displays the book while parsing continues in the
background. It currently supports EPUB only.

## How to use it in the UI

1. Open **Library** and choose **Add book**.
2. Choose an `.epub` file and submit the upload form.
3. The new card appears with **Uploading**, **Queued**, **Processing**,
   **Ready**, or **Failed** status. While parsing is active, the library
   refetches the book list every three seconds.
4. Select a book card to open its book page. The card/page shows the filename,
   parsed title/authors/language, file size, chapter count, and, when available,
   cover.
5. Delete a book from its library card (trash icon) or the book page header
   (**Delete book**) after confirming. It works in any state, including while
   uploading, parsing, or generating audio; the book disappears immediately.

## What happens underneath

1. `POST /books/uploads` validates the requested EPUB metadata: `.epub` name,
   EPUB MIME type, and size from 1 byte to 50 MiB. It creates a `Book` row in
   `UPLOADING` state and returns a short-lived signed `PUT` URL.
2. The browser uploads the file directly to configured S3-compatible object
   storage. The API does not proxy the source EPUB through the Nest HTTP
   process.
3. `POST /books/:bookId/upload-complete` checks the uploaded object's content
   type and size, marks the book `QUEUED`, persists a `PARSE_BOOK` job with an
   idempotency key, and puts that job onto Redis/BullMQ.
4. The library list (`GET /books`) returns owned and added-to-library books
   (see [public sharing](public-sharing.md)), paginated (`limit`/`offset`, max 50 per request); every
   mutation stays owner-scoped. A book detail response returns active
   chapters in their stored order.
5. `DELETE /books/:bookId` (`BookDeletionService`) first sets `Book.deletedAt`
   and, in the same transaction, cancels the book's jobs and marks its audio
   `DELETING`. It then deletes every object under `books/{userId}/{bookId}/`
   (source EPUB, cover, chapter MP3s, temporary parts, plus anything an
   interrupted worker left behind) and finally the rows in foreign-key order.
   Every lookup and worker claim ignores deleted books; a worker already
   running stops at its next status check and deletes what it just uploaded.
   The endpoint is idempotent, so a retry finishes a partly failed deletion.
   A browser upload that lands after deletion can still leave one orphan
   source object (see [`direct-upload-lifecycle.md`](../issues/direct-upload-lifecycle.md)).

## Contributing commits, checked by actual change

- Backend: `80236bf` introduced the durable book/chapter/audio/job data model;
  it did not itself implement an upload UI or worker.
- `aafe455` added the books and object-storage modules; `a6d8ea6` added the
  upload-intent and completion endpoints; `2d766a9` added Redis configuration.
- `89a30f9`, `5734d2e`, and `4400fbe` supplied the worker/queue and parser
  flow. `a356aae` is mainly auth cookie configuration plus a direct-upload
  lifecycle document despite its commit title.
- Frontend: `66a828e` added the library route, cards, dialog/form, direct
  browser upload, parse-status display, and book-page navigation.
- Book deletion: backend `b7c3939` added the endpoint, `Book.deletedAt`,
  prefix storage cleanup, and the deleted-book guards in lookups, the parser,
  and the TTS/merge workers; frontend `514081d` added the confirmed Delete
  action on library cards and the book page (`features/delete-book`).

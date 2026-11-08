# Book and audio workflow

Runtime rules for the book upload, parsing, sharing, collections and
chapter-audio flow. Feature-level behavior is in the
[feature catalogue](../features/README.md); this file holds the invariants an
agent must preserve when changing the code.

1. The API creates a book upload intent and returns a signed object-storage URL.
2. The browser uploads the EPUB directly to storage, then confirms the upload.
3. The API stores a parsing job in Postgres and queues it in BullMQ.
4. The worker parses ordered chapters, uses declared EPUB language metadata
   or detects a fallback language from chapter text, and extracts a supported
   cover when available. It saves cover bytes to
   `books/{userId}/{bookId}/cover/` in object storage, and saves cleaned
   chapter text, language, and private cover metadata in Postgres.
5. `POST /books/:bookId/chapters/:chapterId/audio` creates/resumes one durable
   chapter-audio job and returns `202`.
6. The worker segments chapter text, stores completed temporary MP3 parts in
   object storage, merges them with ffmpeg, saves final audio, then cleans up
   temporary parts.
7. `DELETE /books/:bookId` (`BookDeletionService`) works in any state. It sets
   `Book.deletedAt` and cancels the book's jobs/audio in one transaction, then
   deletes every object under `books/{userId}/{bookId}/` and finally the rows.
   Every book lookup and worker claim must filter `deletedAt: null`; running
   workers stop at their next status check and delete what they just uploaded.
   It is idempotent, so a retry finishes a partly failed deletion.
8. `Book.visibility` (`PRIVATE` default, or `PUBLIC`) lets any signed-in user
   read someone else's book — never write it; mutations stay owner-only
   regardless of visibility, and a private book 404s for a non-owner exactly
   like a nonexistent id (`BooksService.getReadableBook`, used by `GET
/books/:bookId`, its cover, and chapter audio access; `getOwnedBook` keeps
   gating every mutation). `PATCH /books/:bookId/visibility` is owner-only
   and rejects making a non-`READY` book public; flipping back to private
   keeps other users' `BookLibraryEntry` rows, and `GET /books` returns them
   in `ghosts` with only an id and title until the book is public again.
   `BookLibraryEntry { userId, bookId }` is a separate "added to my library"
   reference, not a copy — `POST`/`DELETE /books/:bookId/library` manage it,
   `GET /books?source=owned|added|all` lists by it. `POST /books/:bookId/copy`
   duplicates a public book's source object and re-parses it as a new,
   independently owned book (no audio or curation edits carried over).
   `GET /books/public` lists every public book, searchable by title.
9. `Collection` (`src/collections`) holds ordered `CollectionBook` references,
   never copies. It starts `PRIVATE`. `PATCH /collections/:collectionId/visibility`
   to `PUBLIC` publishes the owner's private books in the same transaction and
   rejects a non-`READY` one with `COLLECTION_BOOKS_NOT_READY`. Going private
   leaves books public. Ghosts are calculated on read: references are kept when
   an item goes private, and permanent deletes remove them. Other viewers only
   get public books. Only the collection owner sees ghost books.

Audio/job state is persisted so the frontend can recover after reload. The
book-detail endpoint exposes chapter audio status and progress.

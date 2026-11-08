# Public book sharing and the community library

## What it is

A book is private by default. Its owner can make it public, after which any
signed-in user can view it, play its ready chapter audio, and download it —
read-only, never edit it. Other users can add a public book to their own
library as a reference (not a copy), or make an independent, fully editable
copy of it.

## How to use it in the UI

1. On your own book's page, once it has finished parsing (**Ready**), use
   **Make public** (confirms, since this exposes it to every user) or
   **Make private** to toggle visibility. A **Public** badge shows next to
   the **Ready**/`EPUB` badges whenever a book is public, including on your
   own page.
2. Open the **Community** tab on the `/library` page to see every public
   book from every user, searchable by title. Each card has an **Add to
   library** / **Remove from library** toggle.
3. On a public book that isn't yours, its page shows the same **Add to
   library** toggle and a **Make a copy** button instead of the owner's
   controls. A copy opens as a new book you fully own once it finishes
   parsing.
4. The `/library` page's **My library** tab has **My books** / **Public** /
   **All** pills to filter between books you own and books you've saved
   from the community library (both the pill and a saved book's card reuse
   the same **Public** badge a book's own page shows, not a separate
   "Saved"/"Added" label). A saved book's card also has a remove action
   instead of the owner-only delete button.

## What happens underneath

- `Book.visibility` (`PRIVATE` default, `PUBLIC`) gates three read-only
  endpoints — book detail, cover, and chapter audio access — to owner-or-
  public (`BooksService.getReadableBook`); a private book 404s a non-owner
  exactly like a nonexistent id. Every mutating endpoint keeps the existing
  owner-only check unchanged — visibility never relaxes a write.
- `PATCH /books/:bookId/visibility` is owner-only and rejects making a
  non-`READY` book public. Flipping back to private keeps every other user's
  saved reference, and `GET /books` returns those as `ghosts` until the book
  is public again.
- `BookLibraryEntry` (`userId`, `bookId`) is a separate "added to my
  library" reference, distinct from ownership — adding a book never copies
  it or changes `Book.userId`. `POST`/`DELETE /books/:bookId/library`
  manage it; `GET /books?source=owned|added|all` lists by it; deleting the
  underlying book also deletes every library entry pointing at it.
- `POST /books/:bookId/copy` duplicates the source EPUB object under the new
  owner's storage prefix and re-parses it exactly like a fresh upload — a
  copy carries no audio and none of the original owner's chapter edits or
  merges, since it starts from the clean EPUB.
- `GET /books/public` lists every public book, searchable by title
  (in-memory substring match — no proven case-insensitive operator was found
  on this ORM's query builder; revisit if the public catalogue grows large).

## Contributing commits, checked by actual change

- Backend: `ece1440` added `Book.visibility`, `BookLibraryEntry`, the read
  relaxation, and the five new endpoints, with the `BookDeletionService`
  cascade.
- Frontend: `e495e30` added the book-page read-only gating, visibility
  toggle, and add/copy actions; `0da22d0` added the community library
  browse page and the `/library` filter pills.

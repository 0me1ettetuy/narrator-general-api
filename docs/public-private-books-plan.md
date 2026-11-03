# Public/private books plan (temporary)

Cross-repo feature plan: backend (`narrator-general-api`) and frontend
(`narrator-fe`). Delete this file once every item below is done, and fold
anything worth keeping into `docs/features/README.md` (backend) and
`CLAUDE.md` (both) — same pattern as `narrator-fe/docs/adaptive-design-plan.md`
used.

## The feature, restated

- A book is **private** (default, current behavior, owner-only) or **public**
  (any signed-in user can view it).
- A public book's detail page is **read-only** for everyone except its owner:
  no delete book, no cover edit, no chapter selection/generate/retry, no
  delete-chapter-audio, no curation entry point (already hidden). It still
  shows chapter text info, ready audio's player, and a download button.
- A `/library/browse` page lists every public book from every user, searchable
  by title, each card with an **Add to library** action.
- From a public book's detail page, a viewer can:
  - **Add to library** — a reference, not a copy. Shows up in their own
    `/library` list, stays read-only, no new storage.
  - **Make a copy** — a brand-new, fully-owned book: re-parsed from a
    duplicated EPUB object, editable like any uploaded book. Does not copy
    audio or the original owner's curation edits.
- `/library` (current page) gets filter pills: **My books** / **Added** /
  **All**, since it now shows both owned and added books together.

## Explicit decisions (confirm before/while implementing)

1. **Copy = re-parse, not clone-rows.** Duplicate the source EPUB object
   under the new owner and queue it through the normal upload→parse pipeline,
   same as a fresh upload. Simpler than hand-cloning `Chapter` rows, and it
   naturally means a copy starts from the clean EPUB — the original owner's
   chapter edits/merges/removals are not carried over. No audio is copied
   either; the new owner picks their own model/voice and generates fresh.
2. **No author/owner attribution on public cards.** `User` has no display
   name today (only `email`, which must never be shown to other users). V1
   shows public books anonymously. Adding a handle is a separate, later
   decision — note it in the catalogue as a known gap, don't build it now.
3. **Visibility → private again removes other users' library entries.**
   If an owner flips a book back to private, every other user's "added"
   reference to it is deleted (not left dangling/blocked). The owner's own
   access is unaffected.
4. **"Add to library" requires no prior relationship** — any signed-in user
   can add any book currently `visibility: PUBLIC`, idempotently (adding
   twice is a no-op, not an error).
5. **Read access follows current visibility, independent of "added."**
   A public book is viewable (and its ready audio streamable/downloadable)
   by any signed-in user the moment it's public, whether or not they've
   added it to their own library list. "Added" only controls whether it
   shows up in their `/library` list.
6. **Mutations always stay owner-only**, regardless of visibility. Visibility
   only ever relaxes reads.
7. **Never leak existence of a private book.** A non-owner requesting a
   private book's id gets the same 404 as a nonexistent id, on every
   book-scoped endpoint (detail, cover, chapter audio access).

## Backend (`narrator-general-api`)

### Schema (`src/prisma/contract.prisma`)

- [x] `Book.visibility BookVisibility @default(PRIVATE)`, new enum
      `BookVisibility { PRIVATE PUBLIC }`. Done.
- [x] New model `BookLibraryEntry { id, userId, bookId, createdAt }`,
      `@@unique([userId, bookId])`, relations to `User` and `Book`. Done.
- [x] Schema applied via `pnpm contract:emit` + `prisma db update`; snapshot
      and ref committed under `migrations/`. Existing books default to
      `PRIVATE`.

### Authorization changes

- [x] Done as `BooksService.getReadableBook(userId, bookId)` (private
      method, not a separate `BookAccessService` — kept it next to the
      `getOwnedBook` it parallels instead of a new file for one helper).
      `getOwnedBook` is untouched and still used by every mutating endpoint.

Endpoints to touch (see `src/books/books.controller.ts` /
`books.service.ts`):

- [x] `GET /books/:bookId` — relaxed; `isOwner`/`isAdded` added to
      `BookSummary` (nested under `book`, not duplicated at the top level —
      `BookSummary` is reused by every listing endpoint too, so this keeps
      one place to compute it rather than two).
- [x] `GET /books/:bookId/cover` — relaxed.
- [x] `GET /books/:bookId/chapters/:chapterId/audio` — relaxed.
- [x] `chapter-curation.service.ts` double-checked: untouched,
      `getOwnedBook` still gates every one of its endpoints. Confirmed by
      not touching the file at all for this feature.

### New endpoints

- [x] `PATCH /books/:bookId/visibility` — 409 on non-`READY`→`PUBLIC`;
      flipping to `PRIVATE` deletes every `BookLibraryEntry` for the book in
      the same transaction as the update.
- [x] `GET /books/public` — paginated, searchable by title. Search ended up
      in-memory (filter+sort+slice after fetching the whole public
      catalogue), not a DB `ILIKE`: no proven case-insensitive substring
      operator was found on this ORM's predicate builder (only `.in()` has a
      confirmed working example anywhere in the codebase), and guessing at
      unverified query-builder API felt riskier than an in-memory filter at
      this scale. Revisit if the public catalogue gets large. No owner info
      in the response, per decision 2.
- [x] `POST /books/:bookId/library` — 404 on a private/nonexistent target;
      409 adding your own book (not in the original plan text, added since
      it's nonsensical and keeps owned/added mutually exclusive, simplifying
      the `GET /books` union below); idempotent otherwise.
- [x] `DELETE /books/:bookId/library` — idempotent, no ownership/visibility
      check needed since it only ever removes the caller's own reference.
- [x] `POST /books/:bookId/copy` — 404 on private/nonexistent; 409 on your
      own book. Copies the object via a new `StorageService.copyObject`
      (added — none existed), creates the new `Book` directly in `QUEUED`
      (skips the `UPLOADING` two-step dance a real upload needs, since the
      object is already placed server-side) and queues parsing exactly like
      `completeUpload` does, by hand rather than via a shared helper
      (`completeUpload`'s queueing is entangled with its own upload-metadata
      verification, which doesn't apply here — extracting a shared helper
      for ~6 lines wasn't worth the indirection).
- [x] `GET /books` — added `source` query param (`owned`/`added`/`all`,
      default `all`) and `isOwner`/`isAdded` per item (via the shared
      `BookSummary` fields, not a separate `source` string — redundant with
      `isOwner` since every returned book is by definition one or the
      other). The owned+added union is computed in memory (fetch both sets,
      sort, slice) rather than a DB-level `OR`, for the same reason as the
      public search above — personal libraries are small enough that this
      is a non-issue in practice.

### Cascades to update

- [x] `BookDeletionService`: `deleteRows` now also deletes
      `BookLibraryEntry` rows for the book, positioned before the `Book` row
      itself is deleted (the spec's FK-order check would catch getting this
      backwards — and did, when sanity-checked by temporarily removing it).
- [x] Visibility-flip-to-private: see `updateVisibility` above.

### Storage

- [x] `StorageService.copyObject(sourceKey, targetKey)` added, using
      `CopyObjectCommand` from `@aws-sdk/client-s3` (already a dependency;
      confirmed exported before use).

### Tests (TDD, per this repo's convention)

- [x] `src/books/books.service.spec.ts`: 17 new tests covering
      `getReadableBook`'s read relaxation (via `getBook` and
      `getChapterAudioAccess`), `updateVisibility` (409, cascade-clears
      other users' entries), `addToLibrary`/`removeFromLibrary` (404/409/
      idempotency), `copyBook` (404/409, new independent book, storage copy,
      job enqueued), and `listBooks`/`listPublicBooks` source/search
      filtering. All 34 tests in the file pass (17 pre-existing + 17 new);
      sanity-checked by temporarily breaking `getReadableBook`'s visibility
      check and confirming a test failed, then restoring it.
- [x] `src/books/book-deletion.service.spec.ts`: extended the existing
      generic table-driven fixture with `BookLibraryEntry`; the existing
      "deletes a parsed book, its rows..." test now covers the cascade for
      free (its `rowsFor` helper now includes the table) rather than needing
      a bespoke new test.
- Not covered by a test: the controller layer itself (route wiring, DTO
  validation, OpenAPI shapes) — verified instead by booting the app (worked
  around the pre-existing `dist` permission issue the same way as earlier
  in this session: redirect `tsconfig.json`'s `outDir` to a temp folder,
  `nest start`, confirm `/books/public` registers before `/books/:bookId`,
  hit `/openapi-json`, then revert) and regenerating the frontend client
  against it successfully.

## Frontend (`narrator-fe`)

### Routing

- `src/app/routes/_authenticated/library/browse.tsx` — new sibling to the
  existing `index.tsx` / `$bookId.tsx`, following the same
  `createFileRoute` pattern.
- `src/pages/public-library/ui/PublicLibraryPage.tsx` — new page slice (FSD:
  reuse `src/pages/library/ui/LibraryBooks.tsx`'s card if it can take a
  "read-only, add button instead of delete" prop rather than forking it
  wholesale — check first whether that component is small enough to extend
  vs. duplicate).
- Reach `/library/browse` via a tab/link in `LibraryPage.tsx`'s header
  (e.g. next to the page title), not a new sidebar icon — keeps the sidebar
  stable and matches how Models/Library are already the only top-level
  destinations.

### `/library` (existing `LibraryPage.tsx`)

- Filter pills: **My books** / **Added** / **All**, URL-synced via the
  route's search params (`validateSearch`), mapped to the new `source` query
  param on `GET /books`. Default `all`, matching current behavior.
- Each book card needs a small indicator for added-but-not-owned books (e.g.
  a muted "Added" badge) so the grid doesn't look like everything is equally
  owned. `LibraryBooks.tsx` / its card component already has a footer slot
  for metadata — extend it, don't rebuild it.
- Removing an **added** book from this page calls `DELETE
/books/:bookId/library`, not the existing `DeleteBookButton` (which is
  `DELETE /books/:bookId` — full deletion, only valid for owned books). Two
  different actions behind what may look like the same "remove" affordance;
  make sure the confirmation copy says "remove from your library" vs.
  "delete this book" accordingly.

### `/library/browse` (new)

- Grid of public book cards (reuse the library grid's responsive classes —
  see `docs/architecture/frontend-architecture.md`'s page-gutter convention
  from the adaptive-design work). Search input wired to the backend's
  `search` param.
- Card's primary action: **Add to library** (`POST /books/:bookId/library`),
  swapping to an "Added ✓" / **Remove** state after success — mirror the
  optimistic/invalidate pattern `DeleteBookButton` already uses with
  `queryClient.invalidateQueries`.
- Clicking the card opens the normal book detail route
  (`/library/:bookId`) — no separate "public book" route; the detail page
  itself branches on `isOwner`/`isAdded` from the response (see below).

### `/library/:bookId` (`BookPage.tsx`, the big one)

This file is already 1400+ lines; don't scatter `isOwner &&` through it.
Prefer: compute `canEdit = book.isOwner` once near the top, and for the
handful of genuinely large owner-only blocks (batch toolbar, chapter
checkboxes, `TtsSelector`, delete-book button, cover editor), wrap each in
`{canEdit && (...)}` at the existing component boundaries — these are
already separate components (`ChapterBatchActions`, `ChapterCard`,
`BookOverview`'s delete button, `BookCoverEditor`) per this session's
earlier FSD work, so this should mostly be prop-gating, not restructuring.

Owner-only, hide entirely when `!canEdit`:

- `DeleteBookButton` in `BookOverview`.
- `BookCoverEditor` (the pencil icon over the cover).
- The whole `ChapterBatchActions` toolbar (Generate, model/voice selector,
  selection controls).
- Per-`ChapterCard`: the selection checkbox, the delete-audio button
  (`ChapterAudioDeleteAction`), and the queue/retry/cancel action
  (`getChapterAudioAction`'s button).

Keep for everyone (owner and read-only viewers alike):

- Title, authors, cover image, `Ready`/`EPUB`-style badges, file/word-count
  metadata.
- Each chapter's position/word-count/title.
- Ready audio: the player and the **download** button
  (`ChapterAudioControls`, minus its `action` slot — pass no
  `deleteAudioAction` when `!canEdit`, the component already takes `action`
  as optional).
- Non-ready audio's status line, if visible to a read-only viewer at all —
  decide whether a viewer should see "queued/processing" for someone else's
  in-flight generation, or only ever see ready/no-audio. Default: show it,
  it's informational only and the component has no mutating affordance in
  that branch besides the (now owner-gated) cancel button.

Add, read-only viewers only:

- **Add to library** / **Remove from library** button where
  `DeleteBookButton` currently sits, when `!canEdit`.
- **Make a copy** button (`POST /books/:bookId/copy`), navigating to the new
  book once created — same page, new id, now fully editable.
- A small "Public" indicator is useful even for the owner's own view, next
  to the existing `Ready`/`EPUB` badges.

Owner-only addition:

- A visibility toggle (e.g. a labeled switch or two-state button) near
  `DeleteBookButton`, calling `PATCH /books/:bookId/visibility`. Making a
  book public is a meaningful, reversible-but-visible action — use the same
  `AlertDialog` confirmation pattern `DeleteBookButton` already uses, not a
  silent toggle.

### i18n

New EN/RU strings needed (non-exhaustive, fill in while implementing): the
three filter pill labels, "Added" badge, browse page title/empty-state/search
placeholder, Add/Remove-from-library button labels + confirmations, Make a
copy button label + success toast, Public/Private labels, visibility-toggle
confirmation copy, Public badge. Every one needs both locales — see
`CLAUDE.md`'s i18n rule.

### After backend changes land

`pnpm api:generate` against the updated `/openapi-json` before touching any
frontend code that consumes the new fields/endpoints — same workflow used
earlier this session for `audio.voiceName`.

## Suggested implementation order

1. Backend schema + `canRead` relaxation on the three read endpoints + tests.
   (Nothing user-visible yet; existing behavior for private books unchanged.)
2. Backend visibility toggle + frontend: Public/Private badge + toggle on
   the owner's own book page. Ship this alone first — it's the smallest
   vertical slice that's actually usable (an owner can make a book public,
   though nobody can find it yet).
3. Backend `GET /books/public` + frontend `/library/browse` page (no Add
   button yet — just confirms the listing works).
4. Backend add/remove-library-entry endpoints + frontend Add/Remove button +
   `/library`'s filter pills + `source`-aware `GET /books`.
5. `BookPage.tsx` read-only mode for non-owners (the big gating pass).
6. Backend copy endpoint + frontend Make a copy button.
7. Delete this plan; fold the schema/endpoint summary into
   `docs/features/README.md` and the owner-only-mutations rule into both
   repos' `CLAUDE.md`.

## Explicitly out of scope for v1

- Moderation, reporting, or takedown tooling for public books.
- Owner attribution/display names on public listings (decision 2).
- Author-name search (title search only).
- Copying audio, or any curation edits, into a copy (decision 1).
- Rate limiting beyond whatever `ThrottlerModule` already applies globally.
- Letting an owner copy their own book.

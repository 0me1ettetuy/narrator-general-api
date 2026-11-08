# Backend change history

This is the committed history of `narrator-general-api`, organized into
milestones and backed by a complete chronological commit index. It documents
what entered the repository, rather than the intent suggested by a commit
subject alone.

**Scope:** 26 August–8 November 2026, through Silero TTS.

**Rules.** Newest milestone first; each entry is 1–3 lines (detail belongs in
the owning doc). Add work in "Uncommitted work". When this file passes about
150 lines, move the oldest milestones to `history/milestones-archive.md`.

## Uncommitted work

- Docs tree audit: added `docs/superpowers/README.md` (plans and specs index,
  marks the Qwen3-TTS plan superseded) and linked it, the root `README.md` and
  `prisma-next.md` from `docs/README.md`, so every markdown file is reachable
  from `CLAUDE.md`/`AGENTS.md`.
- Docs audit fixes: removed stale statements about the local voice picker
  (`TtsSelector` now has a Silero voice dropdown), the server-owned Fish key
  (`fish-audio.md`), the single `minio` Compose profile
  (`container-deployment.md`), and a garbled local-models paragraph in the
  feature catalogue; documented `voiceId` in the catalogue guide.
- Docs restructure: `AGENTS.md` is the single instruction file and `CLAUDE.md`
  only imports it; the workflow and TTS sections moved to
  `docs/books/book-and-audio-workflow.md` and `docs/tts/tts-runtime-rules.md`;
  `docs/README.md` is now a routing table with creation, editing and size-budget
  rules; the 800-line feature catalogue is split into one file per capability
  under `docs/features/`; history split into recent entries, a milestones
  archive and a commit index under `docs/history/`; Definition of done added to
  `AGENTS.md`; `docs/docs-system.md` documents the whole system for reuse in
  other repos.

## Milestones

### 8 November — Silero TTS replaces Qwen3-TTS, with selectable voices

- Removed Qwen3-TTS: adapter, spec, `qwen3-tts` Compose service, its volumes,
  `TTS_LOCAL_QWEN3_TTS_0_6B_*` env keys and the `docker/qwen3-tts-pascal`
  Dockerfile. Reason: a 4 GB Pascal (sm_61) GPU cannot run the 1.7B model, and
  on CPU one segment exceeded the 300 s idle timeout. Recorded in
  `docs/tts/local-tts-models-removed.md`.
- Added Silero TTS (Russian v5, English v3), CPU only: `SileroTtsAdapter`,
  registry entry `local.silero-tts`, `silero-tts` Compose service built from
  `docker/silero-tts` (models baked into the image), and the
  `TTS_LOCAL_SILERO_TTS_*` env keys. Books without a Russian or English
  language now fail with a clear error instead of using a guessed language.
- Local models now segment chapters at 600 characters (`getSegmentMaxCharacters`);
  Fish keeps 4,000.
- Added fixed, read-only local voices: `voices` on `GET /tts/models` (5 Russian,
  5 English), an optional `voiceId` on both generate endpoints validated against
  the book's language, snapshotted on `Audio.voice`. The Silero server rejects
  unknown speakers.
- Added a "Keeping docs in sync" rule to `CLAUDE.md` and `AGENTS.md` and linked
  `docs/tts/local-tts-docker.md` from `docs/tts/README.md`.
- Deleted the dead Qwen audio rows, chunks and jobs from the dev database and
  pointed the dev user's default model at `local.silero-tts`.

### 5 November — book collections

- Added `Collection` (private by default) holding ordered `CollectionBook`
  references, never copies, and `CollectionLibraryEntry` saved references with
  a title snapshot. Added the `COLLECTION_BOOK_NOT_PUBLIC` and
  `COLLECTION_BOOKS_NOT_READY` error codes.
- Added the `src/collections` module: create, read, update, delete, set
  visibility (publishing the owner's private books in the same transaction),
  add, remove, and reorder books, save and unsave collections, and browse
  public collections.
- Going private now keeps other users' book library references. `GET /books`
  returns them as `ghosts` with only an id and title until the book is public
  again. Deleting a book also removes its collection references.
- Recorded the collections spec, the backend plan, and the ghost rules in
  `CLAUDE.md`.

### 3 November — explicit TTS selection and safe book deletion

- Removed both implicit TTS fallbacks. Chapter audio without a saved or
  requested model now fails with `TTS_MODEL_NOT_SELECTED` instead of using the
  first enabled Fish model, and Fish synthesis without a selected voice fails
  with `FISH_VOICE_NOT_SELECTED` instead of using the first configured default
  (or Fish's own default voice). New accounts start with nothing selected.
- Added `DELETE /books/:bookId`, safe in every parse/audio state. It marks the
  book with the new `Book.deletedAt` and cancels its jobs/audio in one
  transaction, deletes every object under the book's storage prefix with the
  new `StorageService.deleteObjectsByPrefix`, then deletes the rows in
  foreign-key order. All API lookups and TTS/merge claims skip deleted books,
  and the parser's final save is now conditional so it cannot revive one.
- Split chapter synthesis into a `fish-chapter-tts` queue (concurrency from
  `TTS_FISH_CONCURRENCY`, default 2) and the local `chapter-tts` queue
  (concurrency 1), routed by the snapshotted model, so one book no longer
  blocks every other user's chapters. Fish `429`/`5xx` responses are now
  retried in-process with `Retry-After` or exponential backoff.

## Older history

- [Milestones archive](history/milestones-archive.md) — milestones before the ones above.
- [Complete commit index](history/commit-index.md) — every committed change, by date and hash.

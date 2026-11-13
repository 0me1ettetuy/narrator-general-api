# Backend change history

This is the committed history of `narrator-general-api`, organized into
milestones and backed by a complete chronological commit index. It documents
what entered the repository, rather than the intent suggested by a commit
subject alone.

**Scope:** 26 August–8 November 2026, through Silero TTS.

**Rules.** Newest milestone first; each entry is 1–3 lines (detail belongs in
the owning doc). Add work under "Recent changes" before committing, so the
entry lands in the same commit as the work. Start each entry with a short unique
title, no hashes; find its commit with `git log -S"<title>" -- docs/history.md`
(or `git blame`). When this file passes about
150 lines, move the oldest milestones to `history/milestones-archive.md`.

## Recent changes

- Active audio list: `GET /books/audio/active` returns the user's own books with chapters queued or processing (stage, part counts), so the frontend can show generation across all books.
- Chapter type parsing fix: title hints ignore the file path and match whole words
  (Unicode-aware, Cyrillic works); `epub:type` is read from the first block only.
- Chapter image follow-ups issue: recorded the deferred review findings
  (`docs/issues/chapter-image-follow-ups.md`).
- Chapter images: parsing keeps EPUB images in storage (`book_image`), marks them
  in chapter text as `[[img_<id>]]`, returns signed URLs in chapter detail and
  strips the markers before narration. Only newly parsed books get images.
- Regenerate chapter audio: `POST /books/:bookId/audio` accepts
  `regenerate: true`, which deletes a `READY` chapter's chunks and files and
  re-queues it with the selected model (`resetReadyChapterAudio`); a model
  change is allowed only for regenerated audio.
- Fish free-to-paid issue: recorded the undetected free-to-paid switch and the
  options considered (`docs/issues/fish-free-model-turns-paid.md`).
- Fish paid-model credit check: `GET /tts/models` marks `fish.s2.1-pro`
  `UNAVAILABLE` (`FISH_CREDIT_REQUIRED`) when the user's Fish balance is zero,
  cached 60 s; selecting it is rejected server-side too.
- GPU model on-demand loading issue: recorded the deferred idea of starting a GPU
  model's container only while it is used (`docs/issues/gpu-model-on-demand-loading.md`).
- Quantized Qwen3-TTS 0.6B: new `local.qwen3-tts-0-6b` model on `qwentts.cpp`
  (GGUF Q8_0, GPU, fits 4 GB), `docker/qwen3-tts` image with an MP3 proxy,
  `qwen3-tts` Compose service, adapter, `TTS_LOCAL_QWEN3_TTS_*` keys. Voice
  lookup now matches id and book language together; chapter audio labels now
  show local voice names (`getLocalVoiceNames`), not only Fish ones.
- MinIO build only when missing: dropped `pull_policy: build` from `minio` in
  `compose.yaml`; rebuild with `docker compose build minio`.
- History without hashes: renamed "Uncommitted work" to "Recent changes"; entries are
  written before the commit with a unique title and found via
  `git log -S"<title>" -- docs/history.md`.
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

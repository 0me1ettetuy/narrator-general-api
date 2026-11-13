# Chapter audio generation

## What it is

Narrator generates one final MP3 per chapter. A user can generate one or many
selected chapters, leave the page or reload it, and later return to the saved
status/progress. This is durable chapter-level audio, not one giant final audio
file for the entire book.

## How to use it in the UI

1. Open a ready book.
2. Tick chapter cards, use **Select narrated chapters** to choose the chapters
   marked for default narration, or use **Select all**.
3. Use the main **Generate** / **Continue** button. Each selected eligible
   chapter becomes its own audio job.
4. Select queued/processing chapters and use **Stop selected** to cancel them.
   `GET /books/audio/active` lists the user's own books that have chapters
   queued or processing (chapter order, stage and part counts), so a client can
   show running work outside the book page.
   Every book summary (library, public list, book detail, collection) carries
   `hasReadyAudio`, true when a live chapter has ready audio, so a client can
   offer Play without opening the book.
   A stopped or failed chapter can be continued later.
5. A finished chapter card shows an in-page audio player and a download link.
   **Delete audio** removes a finished or partial result after confirmation.

## Generation pipeline

```text
User selects chapters
  → API creates/reuses one Audio row + SYNTHESIZE_CHAPTER Job per chapter
  → BullMQ/Redis delivers that durable job to the separate worker
  → worker creates a deterministic text-chunk plan in Postgres
  → selected TTS adapter streams each temporary MP3 part into object storage
  → worker records each completed part and updates chunk progress
  → a separate MERGE_CHAPTER_AUDIO job downloads parts to a temp directory
  → FFmpeg concatenates them, then the final MP3 streams to object storage
  → database marks the Audio READY, temporary objects/rows are removed
```

## What happens underneath

- Text chunking prefers paragraph boundaries up to 4,000 characters. An
  oversized paragraph splits by sentence, then by word only as a last resort.
  This is intentionally less disruptive than fixed word-count splitting.
- `AudioChunk` rows contain the exact chunk text, position, checksum, status,
  and temporary object key. After a retry/restart, stored parts are checked in
  object storage and reused; only missing/unfinished parts are regenerated.
- Provider audio is streamed into object storage instead of buffering a full
  MP3 part in worker memory. The merge step deliberately uses temporary disk:
  it streams each part down, asks FFmpeg to concatenate without re-encoding,
  streams the final MP3 back up, then removes the disk directory.
- `Audio` persists its model key, status, stage, chunk totals, completed count,
  final object key, error, and completion time. `Job` persists attempt/status/
  progress independently from BullMQ, so the UI can recover after refresh.
- Chapter synthesis has two queues, chosen by the snapshotted model: Fish
  chapters run in parallel on `fish-chapter-tts` (`TTS_FISH_CONCURRENCY`,
  default 2, under Fish's per-key concurrency limit) and local-model chapters
  run one at a time on `chapter-tts`, since they share the CPU/GPU. Parsing and
  merging run one job at a time. Jobs have up to three attempts.
- A Fish `429`/`5xx` is retried inside the request up to four times
  (`Retry-After`, otherwise 2/4/8/16 s, each capped at 60 s), so throttling no
  longer burns a chapter's job attempts within seconds.
- Cancelling marks durable work cancelled and removes waiting queue jobs from
  both TTS queues; it cannot recall a provider request already in flight, and
  during a throttling wait it takes effect when the wait ends.
- Deleting audio is stronger than stopping: it cancels applicable jobs, deletes
  final and temporary objects, then deletes audio chunks, audio row, and
  related audio-job records. Editing a chapter's text similarly requires audio
  cleanup first.
- Ready playback/download uses two 15-minute signed storage URLs. The HTML
  audio element streams the MP3 normally; the browser does not first download
  the whole file into JavaScript memory.

## Progress and current UI behavior

- Chapter cards expose `QUEUED`, `PROCESSING`, `READY`, `FAILED`, `CANCELLED`,
  or temporary `DELETING` status and chunk-stage progress.
- The current book page polls the whole book-detail endpoint every second only
  while parsing or chapter audio is active. It is an intentional interim
  implementation tracked in
  [`narrator-fe/docs/issues/book-audio-progress-polling.md`](../../../narrator-fe/docs/issues/book-audio-progress-polling.md),
  not WebSocket or server-sent-event progress.

## Contributing commits, checked by actual change

- Backend: `8e17390` added the boundary-aware chapter segmenter;
  `bea8e13` added persisted chunks and FFmpeg merge infrastructure;
  `1556e17` completed durable final-audio state/cleanup; `b7f197c` completed
  the worker-side TTS/merge job flow; `4b90f39` changed provider-output handling
  to streaming storage uploads.
- Frontend: `3d2432b` first added generation/progress controls. Despite the
  title, `e1aece0` specifically added stop, delete, signed playback, and
  download controls. `7ff3f12` later replaced one-card-at-a-time generation
  with the current batch selection UI.
- Backend `363e89b` split synthesis into the Fish and local queues with
  configurable Fish concurrency and added in-request Fish `429`/`5xx` retries.

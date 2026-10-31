# Narrator feature catalogue

This is the cross-repository catalogue of implemented Narrator capabilities.
It was audited against the complete Git histories and the current source at:

- backend: `fb36b48` (`narrator-general-api` `main`);
- frontend: `ae3399e` (`narrator-fe` `main`).

It groups commits that build one capability, rather than treating each commit
message as a feature description. Current code wins whenever a commit title,
plan, or older UI differs from the final implementation.

## At a glance

| Capability                 | Where a user sees it                         | What it provides                                                                                      |
| -------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Account and session        | Public header, register/login pages, sidebar | Secure sign-up, sign-in, session restore, logout, protected workspace                                 |
| Library and EPUB upload    | `/library`                                   | Direct EPUB upload, parse status, book cards, cover images                                            |
| Parsed book view           | `/library/:bookId`                           | Metadata (including declared language), ordered chapter cards, selection, status and progress         |
| Chapter audio              | Book page                                    | Generate, continue, stop, delete, play and download a chapter MP3                                     |
| Voice models               | `/models`                                    | Per-user Fish key, local model health/status, selected model, and default/custom Fish voice selection |
| Chapter curation           | Book page → **Review chapters**              | Parser suggestions plus manual edit, tag, add, merge, remove, restore, and reorder                    |
| Preferences and navigation | Headers and sidebar                          | Responsive private/public navigation, breadcrumbs, light/dark theme, English/Russian                  |
| Self-hosted deployment     | Deployment configuration                     | R2, S3, or MinIO storage; optional local TTS engines                                                  |

## 1. Account, session, and protected workspace

### What it is

Users can create an account, sign in, stay signed in after a refresh, and sign
out. Book, audio, model-key, and chapter-curation data are scoped to the
authenticated user.

### How to use it in the UI

1. Open **Create account** or **Sign in** from the public header.
2. Submit an email and password. Forms validate input before submission and
   show localized field or server errors.
3. On success, the app routes to `/home`; the private sidebar shows the signed
   in email and offers **Log out**.
4. Opening `/login` or `/register` while signed in routes to `/home` instead.
   Opening a private route while signed out routes to `/login`.

### What happens underneath

- The backend stores a password hash, never a password. A new login creates a
  database `Session` record containing a hash of the refresh token.
- The short-lived access JWT is returned to the frontend and kept only in its
  in-memory session store. The longer-lived refresh JWT is an HttpOnly cookie;
  JavaScript cannot read it.
- `POST /auth/refresh` rotates the refresh token. Reuse of an old refresh token
  revokes the session, which prevents a copied stale token from continuing to
  work.
- A double-submit CSRF cookie/token protects browser mutations. The frontend
  requests a fresh token at bootstrap, after login/register, after refresh,
  and after logout; it adds the token header to non-read requests.
- The API client makes one shared refresh attempt after an authenticated `401`,
  then retries the original request with the new access JWT. Parallel failed
  requests share one refresh promise instead of rotating the cookie repeatedly.
- Each protected endpoint uses the access-token guard and looks up the book or
  other resource through the current user's ID; a client-supplied user ID is
  never trusted.

### Contributing commits, checked by actual change

- Backend: `ae1c3ff`, `4cd97e9`, `2b5e3a1`, `053cc50`, `b80fa30`, `832e7e5`,
  `2d72f29`, and `e5c8227`. Together these added the user/session schema,
  password and JWT services, guards and strategies, CSRF endpoint/middleware,
  safe error codes, OpenAPI contracts, and the correction that invalid CSRF is
  a `403` rather than a server `500`.
- Frontend: `92bcd21`, `64a8c22`, and `fc12396`. These added the generated API
  transport, memory session, CSRF/refresh lifecycle, protected/public layouts,
  forms, and redirects.

## 2. Application shell, navigation, and preferences

### What it is

Narrator has separate public and authenticated shells rather than a collection
of unrelated pages. The public header changes from sign-in actions to the
signed-in user's badge when a session exists. The private workspace has a
collapsible sidebar, header breadcrumbs, and route-level error/404 handling.

### How to use it in the UI

- Use the sidebar to open **Home**, **Library**, and **Models**. The button at
  the top of the sidebar expands or collapses it.
- The header breadcrumb shows the active route hierarchy, for example
  `Library › Book`; use **Library** there to navigate back.
- Use the theme and language controls at the bottom of the expanded sidebar.
  When collapsed, the settings button opens the same controls in a dropdown.

### What happens underneath

- TanStack Router file routes compose public and protected layouts. The
  protected layout owns the access-token check, avoiding duplicated route
  guards in every page.
- The theme provider applies `dark` to the root HTML element and stores the
  selected light/dark value in local storage, so public pages receive the same
  theme on their next mount.
- i18next supplies English and Russian strings. The chosen locale is stored in
  local storage, and all visible UI strings are translated rather than built
  from backend messages.
- Server failures are normalized to stable error codes, translated in the
  frontend, and shown through toasts or page-level error states. Unknown routes
  use a back-navigation 404 page.

### Contributing commits, checked by actual change

- Frontend: `a111cf2`, `a9df164`, and `6a328a8` established router-based
  routing and the current FSD layout (`app → pages → widgets → shared`).
- `64a8c22` added the public/private shells, sidebar, user card, logout,
  breadcrumbs, theme provider, and base pages.
- `318fcfd`, `5aee98a`, `d378f3a`, and `43db021` added localization, localized
  errors/toasts, reusable loading/error/empty states, and the route error page.
- UI primitives came from `fd2bf63`; it is a component-library setup commit,
  not a separate user product feature.

## 3. EPUB library and direct upload

### What it is

The library accepts an EPUB, creates a book record, uploads the source directly
to object storage, and displays the book while parsing continues in the
background. It currently supports EPUB only.

### How to use it in the UI

1. Open **Library** and choose **Add book**.
2. Choose an `.epub` file and submit the upload form.
3. The new card appears with **Uploading**, **Queued**, **Processing**,
   **Ready**, or **Failed** status. While parsing is active, the library
   refetches the book list every three seconds.
4. Select a book card to open its book page. The card/page shows the filename,
   parsed title/authors/language, file size, chapter count, and, when available,
   cover.

### What happens underneath

1. `POST /books/uploads` validates the requested EPUB metadata: `.epub` name,
   EPUB MIME type, and size from 1 byte to 50 MiB. It creates a `Book` row in
   `UPLOADING` state and returns a short-lived signed `PUT` URL.
2. The browser uploads the file directly to configured S3-compatible object
   storage. The API does not proxy the source EPUB through the Nest HTTP
   process.
3. `POST /books/:bookId/upload-complete` checks the uploaded object's content
   type and size, marks the book `QUEUED`, persists a `PARSE_BOOK` job with an
   idempotency key, and puts that job onto Redis/BullMQ.
4. The library API is owner-scoped and paginated (`limit`/`offset`, max 50 per
   request). A book detail response returns active chapters in their stored
   order.

### Contributing commits, checked by actual change

- Backend: `80236bf` introduced the durable book/chapter/audio/job data model;
  it did not itself implement an upload UI or worker.
- `aafe455` added the books and object-storage modules; `a6d8ea6` added the
  upload-intent and completion endpoints; `2d766a9` added Redis configuration.
- `89a30f9`, `5734d2e`, and `4400fbe` supplied the worker/queue and parser
  flow. `a356aae` is mainly auth cookie configuration plus a direct-upload
  lifecycle document despite its commit title.
- Frontend: `66a828e` added the library route, cards, dialog/form, direct
  browser upload, parse-status display, and book-page navigation.

## 4. Background EPUB parsing and book information

### What it is

Parsing turns the uploaded EPUB into durable book metadata and editable,
ordered chapter records without making the upload request wait for parsing.
It also extracts a supported embedded cover image when the EPUB provides one.

### User-visible result

- A queued or processing card means the source file is already stored, but the
  library outline is not ready yet.
- A ready card exposes a title from EPUB metadata when present, authors, and
  non-empty chapters. Its detail page also shows a declared EPUB BCP 47
  language when present. Blank EPUB spine entries do not become chapter cards.
- If the EPUB has a GIF, JPEG, PNG, or WebP cover of at most 10 MiB, it appears
  on library cards and at the top of the book page. A missing/unsupported cover
  simply leaves the normal book presentation in place.

### What happens underneath

- `pnpm worker:dev` (or the built `pnpm worker`) starts a separate Nest
  application context. It consumes `PARSE_BOOK` jobs; the HTTP API only queues
  them. The current parse processor has one concurrent job.
- The worker downloads the source object into temporary worker memory, with the
  accepted source file capped at 50 MiB. The EPUB parser limits an inflated
  entry to 16 MiB, normalizes whitespace, and retains a source href and word
  count for each non-empty chapter.
- Parsing persists title, authors, declared BCP 47 language, and chapters in
  Postgres in a transaction, then transitions the `Book` and its durable `Job`
  from processing to ready/completed. Errors are retried up to three attempts
  and ultimately leave safe failed statuses rather than an HTTP request
  hanging.
- Cover bytes are saved beside the source under a book-specific storage key;
  the database holds only key, MIME type, and byte size. Authenticated users
  receive a 15-minute signed cover URL rather than a public object URL.

### Contributing commits, checked by actual change

- Backend: `5734d2e` added the EPUB parser service; `4400fbe` made parsing a
  durable worker workflow; `05cf283` added cover extraction/storage and the
  signed cover endpoint; `fb36b48` added persisted language metadata.
- Frontend: `7ff3f12` added cover retrieval and rendering to both library and
  book pages; `ae3399e` displays declared language on the book detail page.

## 5. Chapter audio generation

### What it is

Narrator generates one final MP3 per chapter. A user can generate one or many
selected chapters, leave the page or reload it, and later return to the saved
status/progress. This is durable chapter-level audio, not one giant final audio
file for the entire book.

### How to use it in the UI

1. Open a ready book.
2. Tick chapter cards, use **Select narrated chapters** to choose the chapters
   marked for default narration, or use **Select all**.
3. Use the main **Generate** / **Continue** button. Each selected eligible
   chapter becomes its own audio job.
4. Select queued/processing chapters and use **Stop selected** to cancel them.
   A stopped or failed chapter can be continued later.
5. A finished chapter card shows an in-page audio player and a download link.
   **Delete audio** removes a finished or partial result after confirmation.

### Generation pipeline

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

### What happens underneath

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
- The current worker config processes one job at a time in each processor.
  Jobs have up to three attempts. Cancelling marks durable work cancelled and
  removes waiting queue jobs; it cannot recall a provider request already in
  flight.
- Deleting audio is stronger than stopping: it cancels applicable jobs, deletes
  final and temporary objects, then deletes audio chunks, audio row, and
  related audio-job records. Editing a chapter's text similarly requires audio
  cleanup first.
- Ready playback/download uses two 15-minute signed storage URLs. The HTML
  audio element streams the MP3 normally; the browser does not first download
  the whole file into JavaScript memory.

### Progress and current UI behavior

- Chapter cards expose `QUEUED`, `PROCESSING`, `READY`, `FAILED`, `CANCELLED`,
  or temporary `DELETING` status and chunk-stage progress.
- The current book page polls the whole book-detail endpoint every second only
  while parsing or chapter audio is active. It is an intentional interim
  implementation tracked in
  [`narrator-fe/docs/issues/book-audio-progress-polling.md`](../../../narrator-fe/docs/issues/book-audio-progress-polling.md),
  not WebSocket or server-sent-event progress.

### Contributing commits, checked by actual change

- Backend: `8e17390` added the boundary-aware chapter segmenter;
  `bea8e13` added persisted chunks and FFmpeg merge infrastructure;
  `1556e17` completed durable final-audio state/cleanup; `b7f197c` completed
  the worker-side TTS/merge job flow; `4b90f39` changed provider-output handling
  to streaming storage uploads.
- Frontend: `3d2432b` first added generation/progress controls. Despite the
  title, `e1aece0` specifically added stop, delete, signed playback, and
  download controls. `7ff3f12` later replaced one-card-at-a-time generation
  with the current batch selection UI.

## 6. Narration inclusion and batch selection

### What it is

Each chapter has an `includeInDefaultNarration` flag. It lets a book keep
front matter or references in its outline while excluding them from the common
"narrate the book" selection.

### How to use it in the UI

- On the book page, **Select narrated chapters** selects only chapters whose
  inclusion switch is on.
- **Select all** intentionally includes every active chapter, even chapters
  normally excluded. Individual checkboxes remain available for a custom set.
- Use **Review chapters** to change the inclusion switch for one or many
  chapters; the next default selection reflects the change.

### What happens underneath

- The frontend sends explicit `chapterIds` for a batch. The API validates that
  they are unique owned active chapters (up to 1,000), resolves the user's
  selected model, and creates/reuses an independent audio job for each.
- Existing ready/processing audio is skipped or protected from being generated
  with a different model. The response lists affected and skipped IDs.
- There is no hidden automatic "whole book" server job yet. Batch generation
  is a convenience loop over durable chapter jobs, so chapters can complete,
  fail, retry, or be deleted independently.

### Contributing commits, checked by actual change

- Backend: `7f37b3a` added the batch queue/cancel contract and service logic.
- Frontend: `7ff3f12` added the selection controls and switched the book page
  to the batch endpoints.

## 7. Voice models and per-user Fish Audio credentials

### What it is

The **Models** page offers a dynamic local-model group and a Fish Audio group.
Users choose one default model and, for Fish generation, one voice for future
generation. Fish is not a shared deployment key: every user supplies their own
key.

### How to use it in the UI

1. Open **Models** in the private sidebar.
2. Local cards show `READY`, `UNAVAILABLE`, or `DISABLED`. During the current
   rollout, only tested Piper is selectable; other local cards remain visible
   but are marked **Coming soon** until their end-to-end adapter tests pass.
3. To use Fish Audio, enter a personal key in the Fish setup card. The form
   validates it before Fish model cards are displayed.
4. Choose a ready card. The selected card becomes the default for future
   audio generation.
5. When Fish is configured, choose a supplied **Default** voice or one of your
   own **Custom** voices. A custom voice can be added with its Fish reference
   ID and a personal label, then removed when no longer needed.

### What happens underneath

#### Fish Audio

- A user's key is encrypted with AES-256-GCM before Postgres stores it. The
  ciphertext is bound to that user's ID as associated data; the API never
  returns all or part of the key.
- Saving a key calls Fish's authenticated package endpoint with a timeout. The
  stored public state is `MISSING`, `VALID`, `INVALID`, or `UNKNOWN`, so a
  provider/network problem is not falsely presented as an invalid key.
- Fish model definitions are code configuration, not database rows. Currently
  `fish.s2.1-pro-free` and `fish.s2.1-pro` can be toggled by deployment env.
  Fish cards appear only after a valid personal key exists.
- The worker decrypts the owner’s valid key only immediately before a Fish
  synthesis request. An invalid provider response marks the saved key invalid.
- Deployment defaults come from ordered `FISH_DEFAULT_VOICES` JSON in `.env`.
  On backend startup, this list safely creates or updates shared `DEFAULT`
  catalogue rows. Removing an entry from configuration disables its row rather
  than deleting it, which protects historic audio and existing selections.
- `FishVoice` is one catalogue table: global `DEFAULT` rows are shared by all
  users; `CUSTOM` rows have an owner. `User.selectedFishVoiceId` points to an
  enabled default or to that user's custom voice, so defaults are not copied
  once per user.
- `GET /tts/models` returns enabled/disabled voices as
  `providers[0].voices`, with source (`DEFAULT`/`CUSTOM`), name, reference ID,
  and selected state. Users can select a shared default but may only delete
  their own custom row. A deleted selected custom voice clears the preference;
  new Fish jobs then fall back to the first enabled configured default.
- The queue resolves and snapshots the selected reference ID in `Audio.voice`
  at chapter-audio creation. Later selection/catalogue changes cannot mix
  voices in an in-progress chapter or its retries.

#### Local models

- The catalogue currently has Piper, Kokoro-82M, Qwen3-TTS 0.6B, and
  Chatterbox Turbo. Each has a narrow adapter and a health check strategy.
- Local cards are evaluated dynamically: disabled by env → `DISABLED`; enabled
  but failed/mismatched health endpoint → `UNAVAILABLE`; healthy → `READY` and
  selectable. Health results have a small cache to avoid probing on every view.
- Each `TTS_LOCAL_*_ENABLED` value is now the single local-model switch. With
  `COMPOSE_PROFILES=true` (or `minio,true`), Compose starts only containers
  with an enabled flag, and the backend exposes the same enabled models. See
  [`docs/tts/local-tts-docker.md`](../tts/local-tts-docker.md) for hardware and exact
  configuration. Qwen and Chatterbox require NVIDIA Docker support.
- Adapter behavior is deliberately model-specific: Qwen maps the book's BCP 47
  tag to a Qwen language name (or `Auto`); Piper selects its configured English
  default (the supplied value is male `en_US-hfc_male-medium`) or Russian
  `ru_RU-denis-medium`; Kokoro uses `am_michael` for English and rejects
  Russian because Kokoro-82M has no built-in Russian voice. The resolved voice
  is recorded on the audio after its first generated part.

#### Selection snapshot

- Selecting a model writes `User.defaultTtsModelKey`. It is validated against
  the live, user-specific catalogue before saving.
- When a chapter audio row is first created, it snapshots that model ID in
  `Audio.modelKey`. Later preference changes do not silently alter queued or
  completed audio. To regenerate an existing chapter with another model, the
  user must delete its old audio first.

### Current UI/API boundary

The UI supports saving and replacing a Fish key, but does not yet render a
"remove Fish key" button. The backend endpoint already exists for it:
`DELETE /tts/models/providers/fish-audio/credential`.

The Models page renders supplied default voices alongside the user's custom
voices. Defaults are selectable but not removable; custom entries show their
label and may be removed by their owner.

### Contributing commits, checked by actual change

- Backend: `260d9ae` added the registry, local health status, Compose services,
  and models endpoint; `2749fe2` added adapter resolution and four local
  adapters; `941dcc5` added encrypted per-user Fish credentials; `d2b796f`
  added persisted default selection and model snapshot validation; `5904932`
  added the initial per-user Fish voice library; `a818529` replaced it with
  the safely synchronized shared default/custom catalogue and env-driven
  fallback; `fb36b48` added book-language propagation and local voice choice.
- Frontend: `5e96fa2` added the Models route, local/Fish groups, credential
  form, disabled-card states, and model selection UI; `9a37991` added the
  Fish default/custom voice picker and the chapter-audio voice label;
  `ae3399e` added the temporary local-model rollout guard and refined voice
  presentation.

## 8. Chapter curation and outline repair

### What it is

EPUB chapter lists are not always narration-ready: contents pages, copyright
pages, indexes, and very short artifact entries may appear beside real text.
Narrator combines parser suggestions with a fully editable outline. It does
not automatically delete or merge content based only on word count.

### 8.1 Import-time classification

When the EPUB exposes semantic `epub:type` values, the parser maps them to one
of these durable roles:

```text
MAIN | FRONT_MATTER | NAVIGATION | REFERENCE | BACK_MATTER | OTHER
```

- EPUB semantics such as `toc`, `index`, `footnotes`, `preface`, `appendix`,
  and `bodymatter` become high-confidence suggestions.
- If semantics are absent, English/Russian title and href heuristics recognize
  common contents/reference/front/back-matter names as low-confidence
  suggestions.
- A non-linear EPUB spine entry becomes `OTHER` and is excluded by default.
- All other chapters are `MAIN`, included by default. These flags feed the
  **Select narrated chapters** action; they do not force deletion or merging.

### 8.2 Manual outline editing

#### How to use it in the UI

1. Open a book and select **Review chapters**.
2. Inspect role badges and parser-suggestion badges. Change a role or toggle
   narration inclusion for an individual chapter, or apply an inclusion change
   to the currently selected chapter set.
3. Choose **Edit** for a title/text/role/inclusion editor. Text edits display a
   live word count.
4. Add a missing chapter, move a chapter up/down, or select adjacent chapters
   and use **Merge selected**. The merge dialog asks for the resulting title,
   role, and default narration inclusion.
5. Remove an unwanted chapter. It moves to a **Removed chapters** section and
   can be restored unless it was consumed by a merge.

#### What happens underneath

- Imported chapter text, classification source/confidence/reason, origin,
  removal timestamp, merge relationship, and edit timestamp are kept in
  Postgres. A parser decision and a user override remain distinguishable.
- Text/title edits update word count. A user role/inclusion change records
  `USER_OVERRIDE`; manually created chapters record `USER_CREATED`; merges
  record `USER_MERGED`.
- Removes are soft removes: an active outline excludes them, while a standalone
  removed chapter remains restorable. A merge keeps the first selected chapter,
  concatenates selected text with paragraph breaks, soft-removes the rest, and
  records the `mergedIntoChapterId`. Merged source chapters cannot be restored
  independently because their content is now part of the surviving chapter.
- Reordering validates that the submitted list contains every active chapter
  exactly once, then uses a two-pass temporary position update to preserve the
  unique `(bookId, position)` constraint.
- A chapter with queued/processing/deleting audio cannot be text-edited,
  removed, or merged. Existing ready audio requires an explicit discard
  confirmation; the service deletes its final/temporary objects and records
  before applying the outline change. This prevents audio from describing old
  text.
- Input limits are deliberate: title 500 characters, text 1,000,000 characters,
  and at most 1,000 chapters in a bulk curation command.

### Contributing commits, checked by actual change

- Backend: `c1efad6` established the curation design/contract direction;
  `d50f899` supplied the persistent classification fields, classifier,
  curation service, validation, ownership checks, soft remove/restore,
  merge/reorder logic, and endpoint set.
- Frontend: `48b969f` added the review panel, editor sheet, creation/merge/
  removal confirmations, restore list, and up/down ordering controls.

## 9. Storage and self-hosted deployment choices

### What it is

The same storage adapter supports Cloudflare R2, Amazon S3, and local MinIO.
Binary EPUBs, covers, temporary audio parts, and final MP3s live in object
storage; Postgres stores metadata and object keys.

### How an operator uses it

- For R2, set `STORAGE_PROVIDER=r2` with its endpoint, region, bucket, and
  credentials.
- For Amazon S3, set `STORAGE_PROVIDER=s3`, AWS region/bucket/credentials, and
  leave `STORAGE_ENDPOINT` empty so the AWS SDK chooses AWS's endpoint.
- For a local/open-source deployment, set `STORAGE_PROVIDER=minio`, configure
  the local credentials, and use `COMPOSE_PROFILES=minio,true`. Compose starts
  MinIO and an init container creates the bucket.
- Enable only needed local TTS model flags; their persistent volumes preserve
  downloaded weights across container restarts.

### What happens underneath

- One AWS S3 client creates signed upload, playback, and attachment download
  URLs; it uses path-style addressing only for MinIO. It can stream puts/gets
  and batch-delete temporary objects.
- Docker Compose includes Postgres and Redis by default. MinIO and local TTS
  services are optional profiles. The API and the separate worker remain host
  processes in the current setup; if later containerized, local health/synthesis
  URLs must use Docker service names rather than `localhost`.

### Contributing commits, checked by actual change

- Backend: `58ec241` introduced database Compose setup; `aafe455` introduced
  the storage adapter; `dc3b0e1` generalized R2-specific environment naming to
  provider-neutral storage settings; `23e00a5` added MinIO Docker setup.
- `260d9ae`, `eecea24`, and `fb36b48` supply the optional local TTS Docker,
  model-toggle, and language-aware voice behavior described above.

## 10. Typed frontend/backend contract and product foundations

These are developer-facing foundations, not separate buttons in the product,
but they make the features above reliable to evolve.

- The backend exposes Swagger/OpenAPI at `/openapi-json`, uses explicit DTOs
  and response contracts, global validation, CORS/Helmet, consistent error
  shape (`statusCode`, `timeStamp`, `code`, `message`), request logging, and
  Prisma migrations/schema as the durable data contract.
- The frontend uses Hey API to generate its OpenAPI TypeScript client and
  TanStack Query query/mutation helpers. Generated output is intentionally
  ignored; regenerate it after an API contract change rather than editing it.
- Page data uses TanStack Query cache invalidation after mutations. Forms use
  TanStack Form and Zod. Shared shadcn primitives provide the accessible base
  UI, while page-specific book/model/curation behavior stays in page slices.
- API error codes, not raw backend messages, are localized by the frontend.

### Contributing commits, checked by actual change

- Backend foundation: `c12a678`, `e0871a2`, `6814011`, `f8e8c88`, `29a236c`,
  `58ec241`, `4f69942`, `6a2a78a`, `7a50ea6`, `75c25d9`, `319e605`,
  `d615c6f`, `1aa02f3`, `1d110ae`, `c03c3a4`, and `0e845d1` established the
  Nest/Prisma/Compose/validation/error/logging/OpenAPI/documentation baseline.
- Frontend foundation: `f16cfad`, `e46d329`, `2a6e987`, `b2c45b2`, `243ba38`,
  `fd2bf63`, `13eafed`, `9485e03`, `950624c`, `3467471`, `a111cf2`,
  `a9df164`, `2631008`, `6a328a8`, and `cbbf7e8` established the Vite,
  styling/tooling, shadcn, TanStack Query/Router, generated-client, FSD, and
  project-documentation baseline.

## Explicit current boundaries

This section prevents the catalogue from promising features that are only
planned or only partially surfaced.

- **Input formats:** EPUB is the only implemented upload/parser format. PDF,
  Markdown, text, and DOCX are future work.
- **Audiobook scope:** generated output is one MP3 per chapter. Selecting all
  chapters queues all of those chapter jobs; it does not create a single
  full-book MP3, reading view, playlist, or cross-chapter player.
- **Realtime status:** book/audio changes are polled; no WebSocket/SSE push
  channel exists yet.
- **Fish credentials:** a user adds/replaces their key on the Models page. The
  backend supports removal, but the frontend does not yet show a remove-key
  control. The key is not requested automatically on login. Default Fish
  voices are configured by the deployment; users can select but cannot edit or
  delete them.
- **Local models:** Docker definitions and adapters exist, but a local model is
  usable only when its operator enabled it and its real health check succeeds.
  A listed card alone does not mean the model is installed or ready. Until
  each adapter passes an end-to-end check, the frontend exposes only Piper;
  Kokoro-82M cannot narrate Russian with its built-in voices.
- **Curation:** parser classification suggests roles; it never automatically
  merges or deletes short chapters. Users make those decisions explicitly.
- **Progress detail:** chunk progress is durable, but the book page currently
  fetches the full book detail to obtain it rather than a small status-only
  endpoint.

## Related documentation

- [Backend documentation index](../README.md)
- [Backend architecture](../architecture/backend-architecture.md)
- [API contracts and error conventions](../api/api-contracts-and-errors.md)
- [Local TTS Docker configuration](../tts/local-tts-docker.md)
- [TTS model catalogue maintenance](../tts/tts-model-catalogue.md)
- [Chapter curation design](../books/chapter-curation-plan.md)
- [Frontend architecture](../../../narrator-fe/docs/architecture/frontend-architecture.md)
- [Book-page polling follow-up](../../../narrator-fe/docs/issues/book-audio-progress-polling.md)

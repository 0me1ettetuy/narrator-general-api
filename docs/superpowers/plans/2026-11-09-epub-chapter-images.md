# EPUB Chapter Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the images of an EPUB: store them in object storage when parsing, mark their position in chapter text with `[[img_<uuid>]]`, show them inline in the chapter reader, and never narrate the markers.

**Architecture:** The parser builds each chapter's text from `@abfcode/spine` blocks, swapping every image inline for a marker, and returns the unique images book-wide. The parsing service uploads them next to the cover and inserts `book_image` rows in the existing persist transaction. Chapter detail resolves the markers in its text to signed URLs. Markers are stripped in `ChapterSegmenter`, the single place text becomes TTS chunks.

**Tech Stack:** NestJS, Prisma Next (`src/prisma/contract.prisma`), `@abfcode/spine` 0.15, S3-compatible storage (`StorageService`), Jest; React/Vite, TanStack Query, generated API client.

**Spec:** Design agreed in conversation on 2026-11-09 (summarised in "Design decisions" below). No separate spec file.

## Design decisions

- Marker format: `[[img_<uuid>]]`, on its own paragraph for block-level images, inline for images inside text.
- One `book_image` table keyed by book (no chapter column): merge, reorder, remove and restore need no image handling because the marker travels with the text.
- Images with alt text also get a marker; the alt goes to `book_image.alt` and no longer appears in narrated text.
- Same `src` inside one EPUB is stored once (a repeated logo reuses the id).
- Only books parsed after this change get images. `copyBook` re-parses the copied EPUB, so copies get their own images with no extra work.
- Chapter detail is owner-only already, so signed URLs reach owners only.

## Global Constraints

- Object key: `books/{userId}/{bookId}/images/{imageId}.{ext}` (inside the prefix `deleteObjectsByPrefix` removes on book deletion).
- Allowed image types: `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/svg+xml`. Max 10 MiB per image, 300 images per book, 100 MiB per book total. Anything over a limit is skipped: no marker, no error.
- Relative runtime imports use `.js`. Never edit `src/prisma/contract.json` / `contract.d.ts`. Do not log chapter text.
- Gate per repo: backend `pnpm build` (known to fail with `EACCES` on root-owned `dist/`; use `pnpm exec tsc --noEmit` and report), `pnpm test --runInBand`, `pnpm format:check`. Frontend `pnpm lint`, `pnpm format:check`, `pnpm build`.
- Frontend: `@/` imports, strings in both `src/shared/i18n/en.ts` and `ru.ts`, no hand edits in `src/shared/api/generated/`.
- Every task updates docs it affects; `docs/history.md` entry in each repo before its commit.

## Review Focus

- EPUB references an image that is missing from the archive → no marker, parse still succeeds (Task 4).
- Same image used twice (logo, ornament) → one object, one row, same id in both markers (Task 4).
- Chapter that contains only an image → dropped as before, and its image is not uploaded (Task 4, Task 5).
- Oversized, unsupported-type or over-the-per-book-limit image → skipped without a marker (Task 4).
- Chapter text edited so a marker points to an id from another book or to nothing → API returns no image for it and the reader renders nothing, never another book's file (Task 6, Task 8).
- Parse job fails after images were uploaded → uploaded files are deleted; a retry does not leave rows (Task 5).
- Marker mid-sentence leaves no double spaces or empty narrated segments (Task 1, Task 2).

## File Structure

Backend:
- Create `src/books/chapter-image-marker.ts` (+ `.spec.ts`): marker format, find, strip.
- Modify `src/tts/chapter-segmenter.ts`: strip markers before splitting.
- Modify `src/prisma/contract.prisma`; new migration under `migrations/`.
- Modify `src/books/epub-parser.service.ts`, `src/books/types/parsed-epub.type.ts`: text with markers, `images`.
- Modify `src/books/book-parsing.service.ts`: upload, rows, cleanup.
- Modify `src/books/book-deletion.service.ts`: delete `BookImage` rows.
- Modify `src/books/chapter-curation.service.ts`, `src/books/contracts/books.response.ts`, `src/books/contracts/books.openapi.ts`: `images` on chapter detail; markers excluded from word count.

Frontend:
- Create `src/pages/book/model/chapter-images.ts`: split text into text/image parts.
- Modify `src/pages/book/ui/ChapterReorganizePage.tsx`: render images in the reader.
- Modify `src/shared/i18n/en.ts`, `ru.ts`, docs.

---

### Task 1: Marker helpers

**Files:**
- Create: `src/books/chapter-image-marker.ts`
- Test: `src/books/chapter-image-marker.spec.ts`

**Interfaces:**
- Produces:
  - `formatImageMarker(imageId: string): string` → `[[img_<imageId>]]`
  - `findImageMarkerIds(text: string): string[]` → unique ids in order of first appearance, lower-cased
  - `stripImageMarkers(text: string): string` → text without markers, runs of spaces left by a mid-line marker collapsed to one, trimmed

- [ ] **Step 1: Write failing tests** in the spec file:
  - `formatImageMarker('0b9c…uuid')` equals `[[img_0b9c…uuid]]`
  - `findImageMarkerIds('a [[img_<A>]] b\n\n[[img_<B>]] [[img_<A>]]')` equals `[A, B]`
  - `findImageMarkerIds('[[img_not-a-uuid]] [[image_<A>]]')` equals `[]`
  - `stripImageMarkers('He said [[img_<A>]] stop.')` equals `He said stop.`
  - `stripImageMarkers('one\n\n[[img_<A>]]\n\ntwo')` equals `one\n\n\n\ntwo`
- [ ] **Step 2:** Run `pnpm test --runInBand src/books/chapter-image-marker.spec.ts`; expect FAIL (module missing).
- [ ] **Step 3:** Implement the three functions with one shared regex for a v4-style UUID (`[0-9a-f]{8}-…-[0-9a-f]{12}`, `iu` flags).
- [ ] **Step 4:** Re-run; expect PASS.
- [ ] **Step 5:** `git add src/books/chapter-image-marker.* && git commit -m "feat: add chapter image marker helpers"`

### Task 2: Narration never sees markers

**Files:**
- Modify: `src/tts/chapter-segmenter.ts` (`ChapterSegmenter.segment`)
- Test: `src/tts/chapter-segmenter.spec.ts` (create if absent, else add to the existing spec beside it)

**Interfaces:**
- Consumes: `stripImageMarkers` from Task 1.

- [ ] **Step 1: Write failing tests:**
  - `segment('First.\n\n[[img_<A>]]\n\nSecond.')` equals `['First.\n\nSecond.']` (or the equivalent your segmenter returns for two short paragraphs; assert no segment contains `[[img_`).
  - `segment('[[img_<A>]]')` equals `[]`.
  - `segment('Hi [[img_<A>]] there.')` equals `['Hi there.']`.
- [ ] **Step 2:** Run the spec; expect FAIL.
- [ ] **Step 3:** Call `stripImageMarkers(chapterText)` at the start of `segment`. `AudioChunkService.ensurePlan` already throws `Chapter contains no text to synthesize` on `[]`, so no change there.
- [ ] **Step 4:** Run the spec and `src/tts/audio-chunk.service.spec.ts`; expect PASS.
- [ ] **Step 5:** Commit `feat: strip image markers before narration`.

### Task 3: `book_image` table and deletion

**Files:**
- Modify: `src/prisma/contract.prisma`; add migration files under `migrations/`
- Modify: `src/books/book-deletion.service.ts` (`deleteRows`)
- Test: `src/books/book-deletion.service.spec.ts`

**Interfaces:**
- Produces: ORM model `transaction.orm.public.BookImage` with fields `id` (uuid, caller-supplied), `bookId`, `objectKey` (unique), `mimeType`, `size` Int, `alt String?`, `createdAt`; relation to `Book`; `@@index([bookId])`; `@@map("book_image")`. `Book` gains `images BookImage[]`.

- [ ] **Step 1: Write failing test** in the deletion spec: deleting a book also calls `BookImage.where({ bookId }).deleteAndCount()` before deleting the `Book` row (follow how the spec already asserts `Chapter`/`BookAuthor` deletes).
- [ ] **Step 2:** Run the spec; expect FAIL.
- [ ] **Step 3:** Add the model to `contract.prisma`, next to `Chapter`. Run `pnpm contract:emit`.
- [ ] **Step 4:** Create the migration. Run `pnpm prisma migration --help` to find the command that plans one; commit 3256595 ("add collection tables") shows the expected result: `migrations/app/refs/db.json` updated and a new `migrations/snapshots/<hash>/` folder. Apply locally with `pnpm exec prisma db update` only against the dev database.
- [ ] **Step 5:** Add the `BookImage` delete in `deleteRows` just before `Book` is deleted (storage objects are already removed by the existing `books/{userId}/{bookId}/` prefix delete).
- [ ] **Step 6:** Run the deletion spec; expect PASS. Run `pnpm exec tsc --noEmit` and confirm no new errors.
- [ ] **Step 7:** Commit `feat: add book_image table`.

### Task 4: Parser emits markers and images

**Files:**
- Modify: `src/books/epub-parser.service.ts`, `src/books/types/parsed-epub.type.ts`
- Test: `src/books/epub-parser.service.spec.ts`

**Interfaces:**
- Consumes: `formatImageMarker`, `stripImageMarkers` (Task 1).
- Produces:
  - `type ParsedEpubImage = { id: string; bytes: Uint8Array; mimeType: string; alt: string | null }`
  - `ParsedEpub.images: ParsedEpubImage[]` — only images whose marker is in a kept chapter's text.
  - `ParsedEpubChapter.text` contains markers; `wordCount` and language detection use `stripImageMarkers(text)`.
- Constants in the parser file: `MAX_IMAGE_BYTES = 10 * 1024 * 1024`, `MAX_BOOK_IMAGES = 300`, `MAX_BOOK_IMAGE_BYTES = 100 * 1024 * 1024`, `IMAGE_MIME_TYPES` (the five allowed types).

- [ ] **Step 1: Write failing tests** (build fixtures the way this spec already does; the library's `write` export can create an EPUB with images):
  - Chapter `<p>Before</p><img src="a.png" alt="Map"/><p>After</p>` → text has `Before`, then a `[[img_<id>]]` paragraph, then `After`; text contains neither `Map` nor `[image]`; `images` has one entry with `alt: 'Map'`, `mimeType: 'image/png'`, the file's bytes.
  - Same `src` twice → one `images` entry, both markers share its id.
  - `src` missing from the archive → no marker, no entry, no throw.
  - 11 MiB image, and a `.bmp`-typed image → skipped, no marker.
  - Chapter with only an image → chapter dropped, `images` empty; the other chapters are unchanged.
  - Chapter without images → `text` equals what `chapter.text` returned before this change (assert against the library's own `chapter.text` for that fixture).
  - `wordCount` ignores markers (`Before [[img_x]] After` counts 2).
- [ ] **Step 2:** Run the spec; expect FAIL.
- [ ] **Step 3:** Implement. Approach: for each library chapter, take `book.blocksInRange(chapter.start, chapter.end)`, replace every `kind: 'image'` inline (paragraphs, list items, quotes, `figure.images`, table cells incl. nested tables) with a text inline holding the marker (block-level figures/standalone images get blank lines around it), then render with `blocksToText(blocks, DEFAULT_TEXT_OPTIONS)` — both exported by the library, so formatting matches today's `chapter.text`. Resolve each image with `book.openResource(inline.src)` and `contentTypeFromHref(inline.src)`; keep a book-wide `Map<src, ParsedEpubImage | null>` for dedupe and for caching skips; enforce the limits from Global Constraints. After dropping empty chapters, keep only images whose id appears in `findImageMarkerIds` of the kept texts. Check `blocksToText`'s handling of `figure` blocks and fall back to rendering the caption yourself if it omits them.
- [ ] **Step 4:** Run the spec; expect PASS. Run `src/books/chapter-classifier.spec.ts` too.
- [ ] **Step 5:** Commit `feat: keep EPUB images and mark their position in chapter text`.

### Task 5: Upload and persist images

**Files:**
- Modify: `src/books/book-parsing.service.ts` (`parse`, `persistParsedBook`, new `storeImages`)
- Test: `src/books/book-parsing.service.spec.ts`

**Interfaces:**
- Consumes: `ParsedEpub.images` (Task 4), `BookImage` model (Task 3), `StorageService.putObjectBytes(objectKey, bytes, mimeType)` and `deleteObjects(keys)`.
- Produces: private `storeImages(job: ClaimedBookParsingJob, images: ParsedEpubImage[]): Promise<StoredBookImage[]>` where `StoredBookImage = { id, objectKey, mimeType, size, alt }`.

- [ ] **Step 1: Write failing tests:**
  - Parsed EPUB with two images → `putObjectBytes` called with `books/{userId}/{bookId}/images/{id}.png` etc., and two `BookImage.create` calls inside the persist transaction with matching `bookId`, `objectKey`, `mimeType`, `size`, `alt`.
  - `persistParsedBook` rejects → `deleteObjects` is called with the image keys (and the cover cleanup still runs).
  - No images → no storage calls for images.
- [ ] **Step 2:** Run the spec; expect FAIL.
- [ ] **Step 3:** Implement: after `storeCover`, upload images (sequentially); pass them to `persistParsedBook` and create the rows before the chapters; extend the existing catch block to delete image keys as well. Extension from mime type (`png`, `jpg`, `gif`, `webp`, `svg`).
- [ ] **Step 4:** Run the spec; expect PASS.
- [ ] **Step 5:** Commit `feat: store EPUB images during parsing`.

### Task 6: Chapter detail returns images

**Files:**
- Modify: `src/books/chapter-curation.service.ts` (`getChapter`, `toChapterDetailResponse`, `countWords`, constructor), `src/books/contracts/books.response.ts`, `src/books/contracts/books.openapi.ts`
- Test: `src/books/chapter-curation.service.spec.ts`

**Interfaces:**
- Consumes: `findImageMarkerIds`, `stripImageMarkers`; `StorageService.createDownloadUrl(objectKey)`; `BookImage` model.
- Produces:
  - `type ChapterImageResponse = { id: string; url: string; alt: string | null }`
  - `ChapterDetailResponse.images: ChapterImageResponse[]` (order of first appearance in the text) and `ChapterImageResponseDto` + `ChapterDetailResponseDto.images`.
  - `StorageService` injected into `ChapterCurationService` (add `StorageModule` import to the module if it is not already available).

- [ ] **Step 1: Write failing tests:**
  - Chapter text with two markers of this book's images → `images` has both, in order, with `url` from `createDownloadUrl` and the stored `alt`.
  - Marker whose id belongs to another book, and a marker with no row → omitted from `images`.
  - Chapter without markers → `images: []` and no storage call.
  - Merge and text update compute `wordCount` without markers (`countWords('a [[img_<A>]] b')` → 2).
- [ ] **Step 2:** Run the spec; expect FAIL.
- [ ] **Step 3:** In `getChapter`, after loading the chapter, look up images with `BookImage.where({ bookId })` filtered to `findImageMarkerIds(chapter.text)`, sign each URL, and pass them into `toChapterDetailResponse`. Chapter responses returned from update/create/restore endpoints go through the same mapper, so make `images` resolve there too (or return `[]` where the endpoint cannot see them — pick one and keep it consistent across all `ChapterDetailResponseDto` endpoints). Make `countWords` strip markers.
- [ ] **Step 4:** Run the spec; expect PASS.
- [ ] **Step 5:** Commit `feat: return chapter images with signed URLs`.

### Task 7: Docs, history, backend gate

**Files:**
- Modify: `docs/features/chapter-curation.md`, `docs/books/book-and-audio-workflow.md`, `docs/history.md`, `docs/superpowers/README.md` (link this plan); any doc `docs/README.md` routes parsing/storage facts to.

- [ ] **Step 1:** Document the marker format, storage key, limits, narration stripping, the "books parsed before this change keep `[image]`" note, and the new `images` field.
- [ ] **Step 2:** Add the `docs/history.md` entry under "Recent changes" (short unique title).
- [ ] **Step 3:** Run `pnpm test --runInBand`, `pnpm exec tsc --noEmit`, `pnpm format:check`; expect all green except the already-known unrelated errors in `src/tts/tts.service.spec.ts` and `test/app.e2e-spec.ts`.
- [ ] **Step 4:** Commit `docs: chapter images`.
- [ ] **Step 5 (user action):** rebuild API and worker (`docker compose up -d --build api worker`) and apply the migration. Do not run this unprompted.

### Task 8: Frontend reader renders images

**Files:**
- Create: `src/pages/book/model/chapter-images.ts`
- Modify: `src/pages/book/ui/ChapterReorganizePage.tsx` (the `useQueries` text block near line 550 and the `<p>` near line 635), `src/shared/i18n/en.ts`, `src/shared/i18n/ru.ts`
- Modify docs: `docs/features/product-behavior.md`, `docs/history.md`

**Interfaces:**
- Produces: `splitChapterText(text: string): Array<{ kind: 'text'; value: string } | { kind: 'image'; id: string }>` — splits on the `[[img_<uuid>]]` marker, drops empty text parts, trims nothing else.
- i18n key `book.chapterImage` ("Illustration" / "Иллюстрация") used as `alt` when an image has none.

- [ ] **Step 1 (prerequisite):** With the rebuilt API running, run `pnpm api:generate`; confirm `ChapterDetailResponseDto` has `images`.
- [ ] **Step 2:** Implement `splitChapterText`. If the repo has a test runner, add a test (text only, text-marker-text, marker-only, two markers back to back, malformed marker left as text); if it has none, do not add one and verify through the build and the browser.
- [ ] **Step 3:** In the reader, extend the `useQueries` combine to also return `images` merged across source chapters (`Map` by id). Render `splitChapterText(text)`: text parts keep the current `<p className="max-w-[70ch] whitespace-pre-wrap text-base leading-[1.6]">`; image parts render `<img>` with `alt={image.alt ?? t('book.chapterImage')}`, `loading="lazy"`, `className="max-h-[32rem] max-w-full rounded-md border object-contain"`; an id with no matching image renders nothing.
- [ ] **Step 4:** Docs and `docs/history.md` entry.
- [ ] **Step 5:** Run `pnpm lint`, `pnpm format:check`, `pnpm build`; all must pass.
- [ ] **Step 6 (user action):** upload an EPUB with illustrations and open Reorganize; confirm images show in place, no `[[img_…]]` text is visible, and generating audio for that chapter does not read any marker. Signed URLs expire after 15 minutes, so a reader left open longer needs a refresh.
- [ ] **Step 7:** Commit `feat: show chapter images in the reorganize reader`.

## Self-review

- Spec coverage: store (Tasks 3-5), marker position (4), render (8), narration strip (2), cleanup (3, 5), no re-parse of old books (decision).
- Types: `ParsedEpubImage` (4) → `storeImages` (5) → `BookImage` row (3) → `ChapterImageResponse` (6) → generated client → `splitChapterText` consumers (8). Marker helpers named identically in Tasks 1, 2, 4, 6.
- Known limits recorded: signed URL expiry, existing books unchanged, SVG served through `<img>` only.

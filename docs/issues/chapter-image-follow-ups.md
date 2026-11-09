# Chapter images: deferred follow-ups

Status: deferred. The feature itself is described in
[`docs/features/epub-parsing.md`](../features/epub-parsing.md); these are the
rough edges found by the final review. None blocks use.

## Pending setup

- The `book_image` migration ref and snapshot are not recorded yet. Run
  `pnpm exec prisma db update --advance-ref db` against the dev database and
  commit the changed `migrations/app/refs/db.json` and the new
  `migrations/snapshots/<hash>/`.

## Parsing and text

- **Adjacent inline images leave a double space.** `a [[img_A]] [[img_B]] b`
  strips to `a  b` because each match consumes the space the next needs
  (`stripImageMarkers` in `src/books/chapter-image-marker.ts`). Harmless for
  TTS.
- **An image-only list item narrates as `-`.** It renders as `- [[img_…]]`,
  strips to `-`, reaches the segmenter as a paragraph, and a chapter made only
  of such items survives the empty-chapter drop.
- **Marker-only text counts as 1 word** (`countNarratedWords`, the same as the
  old `countWords` for empty text). Narration then fails with "Chapter contains
  no text to synthesize".
- **Images only inside nested tables are missed.** `EpubImageCollector.hasImages`
  does not look inside `cell.tables`, so such a chapter keeps the library text
  (`[image]` or the alt text) and gets no marker, although `replaceInTable`
  already handles nesting.
- **Image type comes from the file extension only** (`contentTypeFromHref`).
  The manifest `media-type` is ignored, so extensionless names such as
  `images/00012` are skipped.
- **Alt text of a skipped image is lost.** A skipped image becomes empty text,
  so its alt no longer appears in the chapter and the reader shows nothing there.
- **Decorative `alt=""` becomes `null`** (`alt?.trim() || null`), so the reader
  cannot tell decorative from missing. Keep `''` distinct; see the
  [frontend follow-up](../../../narrator-fe/docs/issues/chapter-image-reader-follow-ups.md).

## Storage

- **SVG opened directly from its signed URL runs as a document** on the storage
  origin: no `Content-Disposition: attachment` and no CSP. Inside `<img>` it is
  inert and images are owner-only, so today this is self-XSS on a separate
  origin. It matters if images are ever shown to readers of public books.

## Tests

- Parser specs run against the stubbed library in `src/test-mocks/spine.ts`,
  whose `blocksToText` ignores figures, tables and list prefixes. Real-library
  behavior was checked once by hand. A spec that builds an EPUB with the
  library's `write` export would cover it, but the library is ESM-only under
  Jest.
- No tests for the 100 MiB per-book limit or for an upload failing midway
  through `putObjectBytes`.

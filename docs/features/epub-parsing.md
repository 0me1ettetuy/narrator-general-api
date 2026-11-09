# Background EPUB parsing and book information

## What it is

Parsing turns the uploaded EPUB into durable book metadata and editable,
ordered chapter records without making the upload request wait for parsing.
It also extracts a supported embedded cover image when the EPUB provides one.

## User-visible result

- A queued or processing card means the source file is already stored, but the
  library outline is not ready yet.
- A ready card exposes a title from EPUB metadata when present, authors, and
  non-empty chapters. Its detail page also shows the EPUB's declared language
  or a chapter-text fallback when metadata is missing. Blank EPUB spine entries
  do not become chapter cards.
- If the EPUB has a GIF, JPEG, PNG, or WebP cover of at most 10 MiB, it appears
  on library cards and at the top of the book page. A missing/unsupported cover
  simply leaves the normal book presentation in place until the owner adds one.
- Pictures inside chapters are kept. In the chapter reader (owner only), each
  image appears where it stood in the book. Books parsed before this was added
  keep the old `[image]` text and show no pictures.
- On a ready book, the owner can upload a GIF, JPEG, PNG, or WebP image up to
  10 MiB to replace the cover. The replacement overwrites the same private
  object; it does not create an accumulating copy for every edit.

## What happens underneath

- `pnpm worker:dev` (or the built `pnpm worker`) starts a separate Nest
  application context. It consumes `PARSE_BOOK` jobs; the HTTP API only queues
  them. The current parse processor has one concurrent job.
- The worker downloads the source object into temporary worker memory, with the
  accepted source file capped at 50 MiB. The EPUB parser limits an inflated
  entry to 16 MiB, normalizes whitespace, and retains a source href and word
  count for each non-empty chapter.
- Parsing persists title, authors, language, and chapters in Postgres in a
  transaction, then transitions the `Book` and its durable `Job` from
  processing to ready/completed. The declared EPUB language remains the source
  of truth; when it is empty, `franc` detects a primary language from the
  cleaned chapter text and converts its ISO 639-3 result to a BCP 47 primary
  tag. Errors are retried up to three attempts and ultimately leave safe failed
  statuses rather than an HTTP request hanging.
- Cover bytes are saved beside the source under a book-specific storage key;
  the database holds only key, MIME type, and byte size. Authenticated users
  receive a 15-minute signed cover URL rather than a public object URL.
- Chapter images are saved under `books/{userId}/{bookId}/images/{imageId}.{ext}`
  with a `book_image` row (key, MIME type, size, alt text) per file. Only PNG,
  JPEG, GIF, WebP and SVG are kept: at most 10 MiB each, 300 per book and
  100 MiB per book (counted over kept chapters only; an image over a limit keeps
  its marker but has no picture); anything else is skipped without failing the
  parse. The same
  file used twice is stored once. The parser rebuilds the text of a chapter
  that has images from the library's blocks and writes `[[img_<imageId>]]` where
  each image stood; the image's alt text is kept in `book_image.alt` and no
  longer appears in the text. A chapter that holds only images is dropped, like
  a blank one, and its images are not stored. If persisting fails, the uploaded
  files are deleted. Chapter detail (`GET .../chapters/:chapterId`) returns
  `images: [{ id, url, alt }]` with 15-minute signed URLs for the markers in the
  text; a marker with no image of the same book is ignored.
- A cover replacement uses a signed direct PUT URL for that stored key. The API
  verifies storage metadata on confirmation, then updates the book timestamp so
  book-detail and library clients refresh their cached signed URL.

## Contributing commits, checked by actual change

- Backend: `5734d2e` added the EPUB parser service; `4400fbe` made parsing a
  durable worker workflow; `05cf283` added cover extraction/storage and the
  signed cover endpoint; `fb36b48` added persisted language metadata; `041ced4`
  added metadata-missing language detection.
- Frontend: `7ff3f12` added cover retrieval and rendering to both library and
  book pages; `ae3399e` displays declared language on the book detail page.

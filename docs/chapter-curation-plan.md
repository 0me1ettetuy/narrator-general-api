# Chapter curation plan

## Decision

Treat parsed EPUB chapters as a **starting draft**, not a finished audiobook
outline. Narrator will classify sections, recommend what is normally narrated,
and keep every section visible and editable.

It will **not** automatically merge or delete short sections.

The user can edit a title or text, set a section role, include or exclude it
from default narration, add a chapter, merge adjacent chapters, remove a
chapter from the active outline, and restore it later.

"Select all" for audio becomes **Select narrated chapters**. It selects only
chapters included in default narration. A separate action selects every active
section when the user deliberately wants the contents or references narrated.

## Why this is the safe universal approach

An EPUB spine gives an order for reading, but not a dependable list of
narratable chapters. It can include title pages, copyright material, a table
of contents, indexes, appendices, and `linear="no"` supplementary resources.
EPUB also has optional landmarks and `epub:type` semantics, but many EPUB 2,
converted, and hand-authored books omit or misuse them.

That means:

- a short section may be a copyright page, but can also be a dedication,
  epigraph, poem, or intentional one-page chapter;
- front matter can be optional narration, not garbage;
- merging all non-main material would combine unrelated pages and make later
  recovery difficult;
- automatic exclusion from a weak guess could silently drop real writing.

Use this policy instead:

```text
Strong EPUB signal -> role + default-narration recommendation
Weak title/file-name/length signal -> review suggestion only
No reliable signal -> Main content, included by default
User choice -> always overrides every imported suggestion
```

No LLM classification in v1. Rules are deterministic, private, free, and
explainable. A future optional AI helper may make suggestions, but must never
edit, merge, or exclude a chapter without user confirmation.

## EPUB evidence available now

`@abfcode/spine` exposes the evidence needed for the first classifier:

- ordered `spine` items and their `linear` flag;
- normalized table of contents, landmarks, and manifest;
- structured content blocks and their nearest `epub:type`;
- source href and TOC-derived chapter boundaries.

Extend `ParsedEpubChapter` only with safe classification evidence. Do not send
raw XHTML or the whole EPUB package to the browser.

Evidence precedence:

1. `landmarks` targets and relevant `epub:type` values are strongest:
   `bodymatter`, `toc`, `frontmatter`, `backmatter`, `appendix`, `index`,
   `glossary`, `copyright-page`, and `titlepage`.
2. `linear="no"` is supplementary evidence. It can suggest an auxiliary or
   reference role, but remains visible and editable.
3. A navigation document present in the spine is navigation content.
4. Obvious titles/file names such as `contents`, `toc`, `copyright`, `index`,
   or `notes` are low-confidence heuristics.
5. A short non-empty section is only a review signal. It never determines a
   role or an exclusion by itself.

Persist a short safe reason and `HIGH`/`LOW` confidence so the UI can explain
the suggestion without acting like a black box.

## Chapter model

### Role and inclusion are different fields

Role explains **what** a section is. Inclusion decides **whether** it belongs
in default audio selection. For example, a preface can be Front matter and
still be included in narration.

Use one controlled role, not arbitrary tags:

```text
MAIN            primary narrative or instructional content
FRONT_MATTER    title page, preface, dedication, introduction
NAVIGATION      table of contents, lists of figures/tables
REFERENCE       index, glossary, bibliography, notes
BACK_MATTER     appendix, afterword, colophon, end material
OTHER           anything that cannot be classified safely
```

Default inclusion:

```text
MAIN, FRONT_MATTER, BACK_MATTER -> included
NAVIGATION, REFERENCE            -> excluded
OTHER                             -> included unless a high-confidence EPUB
                                     signal identifies it as auxiliary
```

Do not add free-form user tags in v1. They do not drive a product behavior,
make default selection ambiguous, and force every user to invent a taxonomy.
The controlled role is the clean tag system. Add free-form labels later only
if search/organization proves a real need.

### Persistence

Extend `Chapter` with these concepts (exact Prisma names can vary):

```text
role                         ChapterRole enum; default MAIN
includeInDefaultNarration    boolean; default true
classificationSource         EPUB | HEURISTIC | USER
classificationConfidence     HIGH | LOW | null
classificationReason         safe machine-readable code; nullable
origin                       IMPORTED | USER
removedAt                    nullable soft-remove marker
mergedIntoChapterId          nullable merge-history reference
editedAt                     nullable timestamp
```

Add `ChapterEdit`/`ChapterRevision` records for user actions. One record keeps
the affected chapter IDs and a before/after snapshot for an edit, merge,
removal, restore, or reorder command. Retain a bounded history, such as the
last 20 commands or 30 days, so the UI can offer Undo without storing a second
permanent copy of every imported chapter text.

Active chapter queries filter `removedAt IS NULL`. The original EPUB remains
unchanged in storage.

## Audio invariants

No generated audio may remain associated with text that has changed.

| Change | Existing audio behavior |
| --- | --- |
| Role/default-inclusion change | Keep audio; only selection behavior changes. |
| Title-only change | Keep audio; spoken text is unchanged. |
| Text edit | Confirm and delete that chapter's audio. |
| Merge | Confirm and delete audio for every merged chapter. |
| Remove | Confirm and delete that chapter's audio. |
| Reorder | Keep audio; playback order follows new chapter order. |

For text edits, merging, and removal, reject affected chapters with audio in
`QUEUED`, `PROCESSING`, or `DELETING`. Return a stable conflict code and ask
the user to stop generation first. This prevents a worker from finishing audio
for changed text.

Refactor existing chapter-audio deletion into a reusable books-domain helper
that shares the R2, `AudioChunk`, job, and database cleanup rules. Never
regenerate audio automatically after a curation change.

## Backend shape

Keep this in the existing `books` module. A focused service is justified:
chapter curation has different invariants from upload/parsing and TTS queueing.

```text
src/books/
  books.controller.ts              existing reads/upload/audio commands
  books.service.ts                 existing upload/read/audio orchestration
  chapter-curation.service.ts      edits, merge, remove, restore, audio reset
  dto/
    update-chapter.dto.ts
    create-chapter.dto.ts
    merge-chapters.dto.ts
    update-chapter-order.dto.ts
    update-chapter-selection.dto.ts
  contracts/
    chapter-curation.response.ts
    chapter-curation.openapi.ts
  chapter-curation.service.spec.ts
```

Do not create a new microservice, queue, or generic tagging module. Curation
commands are short owner-scoped database operations.

## API plan

Every route has `JwtAccessGuard`, existing CSRF protection for mutations, DTO
validation, ownership scoped by `userId`, Swagger/OpenAPI contracts, and safe
stable errors.

```text
GET    /books/:bookId/chapters/:chapterId
       -> full editable text and curation metadata

PATCH  /books/:bookId/chapters/:chapterId
       -> title, text, role, and/or default inclusion

POST   /books/:bookId/chapters
       -> add a user-created chapter after an active chapter

POST   /books/:bookId/chapters/merge
       -> merge contiguous selected chapters; result title/role/inclusion given

DELETE /books/:bookId/chapters/:chapterId
       -> soft-remove one chapter

POST   /books/:bookId/chapters/:chapterId/restore
       -> restore a removed chapter

PUT    /books/:bookId/chapters/order
       -> explicit ordered active chapter IDs; transactionally reindex

PATCH  /books/:bookId/chapters/selection
       -> batch role/default-inclusion update

POST   /books/:bookId/chapter-edits/:editId/undo
       -> restore the preceding valid snapshot
```

Extend the book-detail chapter summary additively with role, inclusion, and
safe review-suggestion data. Keep full text out of normal book detail; fetch
it only when the editor opens.

Merge requirements:

- accept only at least two active chapters adjacent in current order;
- concatenate text in current order with one paragraph boundary;
- require an explicit result title, role, and inclusion choice;
- retain source rows as soft-removed/merged history for Undo;
- reindex active positions in one transaction.

## Parser and worker work

1. Extend parsed EPUB types with source classification evidence.
2. Add a narrow `ChapterClassifier` in `src/books/`; it makes no external
   request and maps known EPUB semantics to role/inclusion/review values.
3. Persist those fields with imported chapters in `BookParsingService`.
4. Record only safe parse/classification codes; never log source text.
5. Keep the durable parse/TTS job topology unchanged.

## Delivery order

1. Data model, migration, parser evidence, classifier, and tests from
   well-formed and malformed EPUB samples.
2. Additive read fields and the on-demand chapter-detail endpoint; regenerate
   the frontend client.
3. Safe role/default-inclusion updates; change default audio selection.
4. Title/text editing and its audio cleanup lifecycle.
5. Add, soft-remove/restore, merge, reorder, and bounded Undo history.
6. Hardening: authorization, validation, adjacent-merge, active-audio,
   concurrency/idempotency tests, then real EPUB testing.

## Acceptance criteria

- Strong `toc`/navigation evidence is visibly marked and excluded by default,
  but can be included by the user.
- A short chapter alone is never silently removed or excluded.
- Users can fix bad outlines through role changes, merging, removal, text
  editing, and adding a replacement chapter.
- Default selection excludes only inactive/default-excluded active chapters;
  an explicit all-sections action remains available.
- No audio remains attached to edited, merged, or removed text.
- A refresh shows exactly the persisted curation state.

## Research basis

- [EPUB 3.3 — spine and `linear`](https://www.w3.org/TR/epub-33/#sec-spine-elem)
- [EPUB 3.3 — navigation and landmarks](https://www.w3.org/TR/epub-33/#sec-nav)
- [EPUB Structural Semantics Vocabulary](https://www.w3.org/TR/epub-ssv-11/)
- [`@abfcode/spine` parser capabilities](https://www.npmjs.com/package/@abfcode/spine)

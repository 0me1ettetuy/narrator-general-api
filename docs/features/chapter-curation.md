# Chapter curation and outline repair

## What it is

EPUB chapter lists are not always narration-ready: contents pages, copyright
pages, indexes, and very short artifact entries may appear beside real text.
Narrator combines parser suggestions with a fully editable outline. It does
not automatically delete or merge content based only on word count.

## 8.1 Import-time classification

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

## 8.2 Manual outline editing

> **UI reduced.** The frontend exposes only tagging, narration toggle and merge,
> on the **Reorganize chapters** page (`/library/:bookId/reorganize`). The other
> endpoints below (edit, add, remove, restore, reorder) are unchanged but have
> no UI. The steps below describe the old review sheet.

### How to use it in the UI

1. Open a book and select **Reorganize chapters**.
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

### What happens underneath

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

## Contributing commits, checked by actual change

- Backend: `c1efad6` established the curation design/contract direction;
  `d50f899` supplied the persistent classification fields, classifier,
  curation service, validation, ownership checks, soft remove/restore,
  merge/reorder logic, and endpoint set.
- Frontend: `48b969f` added the review panel, editor sheet, creation/merge/
  removal confirmations, restore list, and up/down ordering controls.

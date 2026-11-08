# Narration inclusion and batch selection

## What it is

Each chapter has an `includeInDefaultNarration` flag. It lets a book keep
front matter or references in its outline while excluding them from the common
"narrate the book" selection.

## How to use it in the UI

> **UI entry points currently hidden.** The **Select narrated chapters**
> quick-select and each chapter card's role tag badge, "excluded from
> narration" pill, and "Parser suggestion" pill are commented out; only
> **Select all** and individual checkboxes remain. See
> [`narrator-fe/docs/issues/chapter-tags-and-narrated-selector-hidden.md`](../../../narrator-fe/docs/issues/chapter-tags-and-narrated-selector-hidden.md).
> `includeInDefaultNarration` itself, the API, and the batch-generation logic
> below are unchanged.

- On the book page, **Select narrated chapters** selects only chapters whose
  inclusion switch is on.
- **Select all** intentionally includes every active chapter, even chapters
  normally excluded. Individual checkboxes remain available for a custom set.
- Use **Review chapters** to change the inclusion switch for one or many
  chapters; the next default selection reflects the change.

## What happens underneath

- The frontend sends explicit `chapterIds` for a batch. The API validates that
  they are unique owned active chapters (up to 1,000), resolves the user's
  selected model, and creates/reuses an independent audio job for each.
- Existing ready/processing audio is skipped or protected from being generated
  with a different model. The response lists affected and skipped IDs.
- There is no hidden automatic "whole book" server job yet. Batch generation
  is a convenience loop over durable chapter jobs, so chapters can complete,
  fail, retry, or be deleted independently.

## Contributing commits, checked by actual change

- Backend: `7f37b3a` added the batch queue/cancel contract and service logic.
- Frontend: `7ff3f12` added the selection controls and switched the book page
  to the batch endpoints.

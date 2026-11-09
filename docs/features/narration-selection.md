# Narration inclusion and batch selection

## What it is

Each chapter has an `includeInDefaultNarration` flag. It lets a book keep
front matter or references in its outline while excluding them from the common
"narrate the book" selection.

## How to use it in the UI

> **UI entry points currently hidden.** The **Select narrated chapters**
> quick-select and the "Parser suggestion" pill are commented out. Chapter
> cards show the role tag and a **Not narrated** tag, and chapters marked not
> narrated have no checkbox. See
> [`narrator-fe/docs/issues/chapter-tags-and-narrated-selector-hidden.md`](../../../narrator-fe/docs/issues/chapter-tags-and-narrated-selector-hidden.md).
> `includeInDefaultNarration` itself, the API, and the batch-generation logic
> below are unchanged.

- On the book page, **Every chapter** selects only chapters whose inclusion
  switch is on; chapters marked not narrated can't be selected or generated.
- Use **Reorganize chapters** to change the inclusion switch for one or many
  chapters; the next default selection reflects the change.

## What happens underneath

- The frontend sends explicit `chapterIds` for a batch. The API validates that
  they are unique owned active chapters (up to 1,000), resolves the user's
  selected model, and creates/reuses an independent audio job for each.
- Existing ready/processing audio is skipped or protected from being generated
  with a different model. The response lists affected and skipped IDs.
- With `regenerate: true`, chapters whose audio is `READY` are reset instead:
  the audio's chunks and stored files are deleted, the audio is re-queued
  with the selected model and voice, and the worker re-plans and
  re-synthesizes from the current chapter text. The book page sends this
  after a confirmation when ready chapters are selected.
- There is no hidden automatic "whole book" server job yet. Batch generation
  is a convenience loop over durable chapter jobs, so chapters can complete,
  fail, retry, or be deleted independently.

## Contributing commits, checked by actual change

- Backend: `7f37b3a` added the batch queue/cancel contract and service logic.
- Frontend: `7ff3f12` added the selection controls and switched the book page
  to the batch endpoints.

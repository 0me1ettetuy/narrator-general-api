# Explicit current boundaries

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
- **Local models:** disabled; see [voice models](voice-models.md) for the
  restoration record.
- **Curation:** its UI entry point is currently hidden (see [chapter curation](chapter-curation.md)). Parser classification suggests roles; it never automatically merges
  or deletes short chapters. Users make those decisions explicitly.
- **Role tags and narrated-chapters quick select:** also currently hidden
  (see [narration selection](narration-selection.md)); only **Select all** and individual chapter
  checkboxes remain for batch selection.
- **Progress detail:** chunk progress is durable, but the book page currently
  fetches the full book detail to obtain it rather than a small status-only
  endpoint.
- **Public book attribution:** the community library and a public book's page
  never show who shared it. `User` has no display name today, only an
  `email` that must never be shown to other users; adding a handle is a
  separate, later decision.
- **No moderation:** there is no reporting, flagging, or takedown tooling for
  public books.
- **Collection pickers:** the add-to-collection picker and the add-books
  dialog show at most 50 collections or books and have no search.
- **Ghost lists:** ghost books and saved-collection ghosts are returned in
  full, not paginated.
- **Collection reorder:** the request must list every book ID in the
  collection, including ghosts, so the client sends the full set.

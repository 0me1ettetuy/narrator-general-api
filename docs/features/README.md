# Narrator feature catalogue

This is the cross-repository catalogue of implemented Narrator capabilities.
It was audited against the complete Git histories and the current source at:

- backend: `fb36b48` (`narrator-general-api` `main`);
- frontend: `ae3399e` (`narrator-fe` `main`).

It groups commits that build one capability, rather than treating each commit
message as a feature description. Current code wins whenever a commit title,
plan, or older UI differs from the final implementation.

## At a glance

| Capability                 | Where a user sees it                         | What it provides                                                                                                  |
| -------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Account and session        | Public header, register/login pages, sidebar | Secure sign-up, sign-in, session restore, logout, protected workspace                                             |
| Library and EPUB upload    | `/library`                                   | Direct EPUB upload, parse status, book cards, cover images, book deletion                                         |
| Parsed book view           | `/library/:bookId`                           | Metadata (including declared language), ordered chapter cards, selection, status and progress                     |
| Chapter audio              | Book page                                    | Generate, continue, regenerate, stop, delete, play and download a chapter MP3                                     |
| Voice models               | `/models`                                    | Per-user Fish key, selected model, and default/custom Fish voice selection (local models disabled)                |
| Chapter curation           | Book page → **Reorganize chapters**          | Parser suggestions; UI offers tag, narration toggle and merge (API also edits, adds, removes, restores, reorders) |
| Public book sharing        | Book page, `/library`'s **Community** tab    | Make a book public, browse/search the community library, add or copy someone else's public book                   |
| Book collections           | `/library`'s **Collections** tab, Community  | Group books in order, share them publicly, save other people's collections, keep ghosts                           |
| Preferences and navigation | Headers and sidebar                          | Responsive private/public navigation, breadcrumbs, light/dark theme, English/Russian                              |
| Self-hosted deployment     | Deployment configuration                     | R2, S3, or MinIO storage; optional local TTS engines                                                              |

## Capability docs

Open only the file for the capability you are changing. One file per
capability keeps each under the size budget in the [docs rules](../README.md).

| Doc                                                    | Holds                                                                      | Edit it when                                | Status  |
| ------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------- | ------- |
| [account-and-session.md](account-and-session.md)       | Sign-up, sign-in, session restore, logout, protected workspace             | auth or session behavior changes            | current |
| [app-shell.md](app-shell.md)                           | Navigation, breadcrumbs, theme, English/Russian preferences                | headers, sidebar, theme or locale change    | current |
| [library-and-upload.md](library-and-upload.md)         | Library page, direct EPUB upload, covers, book deletion                    | upload, library list or cover flow changes  | current |
| [epub-parsing.md](epub-parsing.md)                     | Background parsing, language and author metadata, book information         | worker parsing or book metadata changes     | current |
| [chapter-audio.md](chapter-audio.md)                   | Generating, stopping, deleting, playing chapter MP3s; progress             | audio pipeline or its UI changes            | current |
| [narration-selection.md](narration-selection.md)       | Narration inclusion and batch chapter selection                            | selection or default-narration rules change | current |
| [voice-models.md](voice-models.md)                     | Models page, Fish keys and voices, Silero local voices, selection snapshot | model, key or voice behavior changes        | current |
| [chapter-curation.md](chapter-curation.md)             | Import-time classification and manual outline repair (UI hidden)           | curation rules or API change                | current |
| [storage-and-deployment.md](storage-and-deployment.md) | R2/S3/MinIO storage, self-hosted choices                                   | storage or deployment options change        | current |
| [contract-foundations.md](contract-foundations.md)     | Typed frontend/backend contract and product foundations                    | contract tooling or foundations change      | current |
| [public-sharing.md](public-sharing.md)                 | Public books, community library, add/copy                                  | visibility or sharing rules change          | current |
| [collections.md](collections.md)                       | Ordered collections, sharing, saved collections, ghosts                    | collection behavior changes                 | current |
| [boundaries.md](boundaries.md)                         | What the product deliberately does not do yet                              | a limit is added, lifted or discovered      | current |

Each file follows the same layout: what it is, how to use it in the UI, what
happens underneath, and the contributing commits.

## Related documentation

- [Backend documentation index](../README.md)
- [Backend architecture](../architecture/backend-architecture.md)
- [API contracts and error conventions](../api/api-contracts-and-errors.md)
- [Local TTS Docker configuration](../tts/local-tts-docker.md)
- [TTS model catalogue maintenance](../tts/tts-model-catalogue.md)
- [Chapter curation design](../books/chapter-curation-plan.md)
- [Frontend architecture](../../../narrator-fe/docs/architecture/frontend-architecture.md)
- [Book-page polling follow-up](../../../narrator-fe/docs/issues/book-audio-progress-polling.md)

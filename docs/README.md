# Narrator backend documentation

Routing table and rules for this docs tree. Read this file instead of opening
documents to find out what they hold. `AGENTS.md` (loaded through `CLAUDE.md`)
links here and nothing else needs to be read first.

## Rules

**Where a fact goes**

| The fact is… | It goes in… |
| --- | --- |
| How the system behaves now | the owning domain doc (table below), `status: current` |
| A user-visible capability or limit | `features/<capability>.md` or `features/boundaries.md` |
| A change that was just made | `history.md`, "Uncommitted work", 1–3 lines |
| A decision, plan or research | `superpowers/`, `integrations/` or the domain's plan doc |
| Known follow-up work | `issues/` |

**Editing.** Find the owning doc in the table, edit that doc, and keep it
accurate rather than appending a changelog to it (history belongs in
`history.md`). Fix every link to anything you rename or remove.

**Creating a doc.** Prefer, in order: edit an existing doc, add a section to
one, create a new file. A new file goes in the folder of the domain it
describes, starts with a `# Title`, a one-sentence summary and a `Status:`
line (`current`, `historical`, `superseded`, `deferred`), and is linked from
that folder's README and, if it is a new top-level domain, from the table
below. Name files after what they hold, in lowercase-kebab-case. Never leave a
doc unlinked.

**Size budget.** An index README stays under about 100 lines. Any other doc
stays under about 300 lines, with a hard cap of 400. Docs over 100 lines start
with a short contents list. A doc you touch that is over budget is split
before the task is done: turn it into a folder whose README is a routing table
(one row per part: what it holds, when to edit it), and keep parts above about
100 lines so the tree does not fragment.

**Status tags.** `current` is safe to rely on. `historical`, `superseded` and
`deferred` docs are context only; never use them to learn current behavior.
Historical docs are exempt from the size budget unless you edit them.

## Routing table

Folders have their own README with a row per file; this table names what to
open for a given change.

| Area | Open it for | Edit it when | Status |
| --- | --- | --- | --- |
| [features/](features/README.md) | what the product does, per capability (account, library, audio, models, curation, sharing, collections) and its limits | user-visible behavior changes | current |
| [history.md](history.md) | recent milestones; older ones in `history/milestones-archive.md`, every commit in `history/commit-index.md` | every change (uncommitted section) | log |
| [architecture/](architecture/README.md) | module boundaries, delivery checklist, container deployment | structure, workers, Docker or Compose change | current |
| [api/](api/README.md) | OpenAPI, DTO, status-code and error-envelope rules | the HTTP contract or error codes change | current |
| [books/](books/README.md) | `book-and-audio-workflow.md` runtime invariants, chapter curation design, segmentation check | upload, parsing, deletion, sharing, collections or curation change | current |
| [tts/](tts/README.md) | `tts-runtime-rules.md`, `tts-model-catalogue.md` (add or toggle a model), `local-tts-docker.md`, Fish notes, restoration record of removed local models | model selection, queues, keys, voices or Docker toggles change | current |
| [integrations/](integrations/README.md) | third-party research (OpenRouter) | the research is redone | historical |
| [issues/](issues/README.md) | deferred work and why features are hidden or disabled | an issue is opened, resolved or moved into its domain doc | deferred |
| [superpowers/](superpowers/README.md) | dated plans and specs (book collections, the Qwen3-TTS plan) | a new plan or spec is written | historical |
| [docs-system.md](docs-system.md) | how this docs tree works, portable so it can be reused in another repo | the docs rules, layout or Definition of done change | current |
| [../README.md](../README.md) | project overview and setup | setup steps change | current |
| [../prisma-next.md](../prisma-next.md) | Prisma Next usage notes | the Prisma tooling changes | current |

## Cross-repository

The frontend repo documents its own structure in
`../../narrator-fe/docs/README.md`. Product features are catalogued only here.

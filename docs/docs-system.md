# Documentation system

Status: current. A portable description of how this repo's docs are organized
and maintained. Give this file to an agent to set up the same structure in
another repository.

## Idea

Docs are a tree with one entry point. An agent reads a small routing table,
learns what every doc holds and when to edit it, and opens only the one file it
needs. Nothing is reachable only by search, and no file grows without bound.

## Layout

```text
AGENTS.md              the one instruction file: project rules, commands,
                       Definition of done, pointer to docs/README.md
CLAUDE.md              one line: @AGENTS.md   (so Claude Code loads it too)
docs/
  README.md            routing table + rules (the manifest)
  history.md           recent milestones + "Recent changes"
  history/             milestones-archive.md, commit-index.md
  <domain>/README.md   per-folder routing table, one row per file
  <domain>/*.md        the docs themselves
  issues/              deferred work, hidden or disabled features
  superpowers/         dated plans and specs (historical)
  features/            one file per user-visible capability + boundaries.md
```

Rules for the shape:

- Every doc is linked from its folder README; every folder README and
  top-level area is a row in `docs/README.md`. No orphans, no broken links.
- `AGENTS.md` is the only instruction file with real content. `CLAUDE.md` only
  imports it, so the two never drift.
- The entry file holds rules and commands, not feature detail. Detail lives in
  docs it links.

## The manifest (`docs/README.md`)

Two parts, in this order.

**Rules**

- _Where a fact goes:_ current behavior to the owning domain doc; a
  user-visible capability or limit to `features/`; a just-made change to
  `history.md` (Recent changes, 1–3 lines); decisions, plans and research to
  `superpowers/`, `integrations/` or the domain's plan doc; follow-up work to
  `issues/`.
- _Editing:_ find the owning doc in the table, edit it, keep it accurate
  instead of appending a changelog, and fix links to anything renamed or removed.
- _Creating:_ prefer editing, then a new section, then a new file. A new file
  goes in its domain folder, begins with `# Title`, a one-sentence summary and
  a `Status:` line, and is linked from the folder README (and from the manifest
  if it is a new top-level area). Names are lowercase-kebab-case.
- _Size budget:_ index README under ~100 lines; other docs under ~300, hard cap
  400; docs over 100 lines start with a contents list. A touched doc over
  budget is split before the task is done: it becomes a folder whose README is
  a routing table, and parts stay above ~100 lines. Historical docs are exempt
  unless edited.
- _Status tags:_ `current` is safe to rely on; `historical`, `superseded`,
  `deferred` are context only and never a source of current behavior.

**Routing table**: columns `Area | Open it for | Edit it when | Status`, one row
per folder or key file. Folder READMEs use the same columns, one row per file.
The "Edit it when" column is what lets an agent route an edit without reading
the doc.

## History

- `history.md`: newest milestone first, each entry 1–3 lines, plus an
  "Recent changes" section. Write the entry before the commit so it lands with
  the work; start it with a short unique title and no hash. Find the commit with
  `git log -S"<title>" -- docs/history.md`.
- When it passes ~150 lines, move the oldest milestones to
  `history/milestones-archive.md`. The commit index lives in
  `history/commit-index.md`.

## Definition of done (in `AGENTS.md`)

1. Code works; the project's build, test and lint commands pass.
2. Affected docs are updated using the routing table; new docs are linked.
3. `docs/history.md` has an entry under "Recent changes" (unique title, no hash).
4. Touched docs are within the size budget.
5. No server, worker or watcher started for the task is left running.

## Setting it up in a new repo

1. Create `AGENTS.md` with the project rules and commands, the Definition of
   done above, and a "Documentation rules" section pointing to `docs/README.md`.
   Create `CLAUDE.md` containing only `@AGENTS.md`.
2. Create `docs/README.md` with the Rules block above and an empty routing table.
3. Group existing docs by domain folder, write a README table for each folder,
   and add one row per folder to the manifest.
4. Create `docs/history.md` with the rules note and "Recent changes" and
   "Milestones" headings.
5. Split any doc over budget; mark old plans and research `historical`.
6. Check that every doc is reachable from `AGENTS.md` through the READMEs and
   that no link is broken.

## Maintenance risk

The manifest can rot: a row that no longer matches its file misleads the next
agent. Whoever edits a doc re-reads its table row and fixes it in the same task.

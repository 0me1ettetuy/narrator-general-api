# Context-aware EPUB chapter classification plan

Replace independent chapter-type guesses with a book-aware pipeline that can
recognise supporting sections split across many EPUB files, while retaining the
existing FastText model as the local CPU classifier.

Status: planned

## Goal

Classify imported EPUB sections using the same cues a human uses:

- word count and relative size within the book;
- the navigation title and the first visible in-text heading;
- the start, middle and end of the text;
- EPUB semantic metadata and spine position;
- neighbouring sections, especially continuous runs of short pieces;
- structures such as a table of contents, copyright page, glossary entries,
  citations, notes and consecutive reference entries.

Only `MAIN` starts narrated. Classification remains editable. Automatic joining
must leave the same recoverable merge history that lets a user split a chapter
again.

## Current implementation

The backend parser returns one `ParsedEpubChapter` per EPUB spine section with
`position`, `title`, `sourceHref`, `text`, `wordCount`, `semanticTypes` and
`isLinear`.

Rules first honour recognised EPUB semantic types, then title-based rules for
TOC, reference, front-matter and back-matter terms. Remaining linear sections
default to `MAIN`. The enabled FastText service uses the chapter title plus the
first 1,500 text characters, accepts a prediction at confidence `>= 0.70`, and
otherwise retains the rule result.

The public role taxonomy is:

| Role | Default narration |
| --- | --- |
| `MAIN` | on |
| `FRONT_MATTER` | off |
| `NAVIGATION` | off |
| `REFERENCE` | off |
| `BACK_MATTER` | off |
| `OTHER` | off |

The current model's six internal labels map as follows: `content` → `MAIN`,
`frontmatter` → `FRONT_MATTER`, `navigation` → `NAVIGATION`, `reference` →
`REFERENCE`, and `supplement` / `backmatter` → `BACK_MATTER`.

## Training workspace outside the backend repository

All raw corpus material, teacher labels, scripts and the source model live in
the sibling workspace [narrator-fastText](/home/omelettetuy/github/narrator-fastText).
The backend bundles its copy at
`narrator-general-api/models/chapter-type-initial.bin`.

| Location | Contents |
| --- | --- |
| `data/` | 300 English EPUBs at the directory root and 504 Russian EPUBs under `data/ru/` |
| `prepared.jsonl` | extracted section records used to make label batches |
| `labeling/` | main confirmed candidate labels and source batches/responses |
| `labeling-rare/` | extra sparse-role examples |
| `labeling-ru-rare/` | sparse Russian examples |
| `labeling-ru-wikisource/` | Russian Wikisource labels |
| `labeling-prompt.md` | the teacher-label taxonomy and JSON output contract |
| `build_training_data.py` | book-held-out, balanced six-class FastText training set builder |
| `training/` | generated `train.txt` and `test.txt`, safe to regenerate |
| `models/chapter-type-initial.bin` | selected 15 MiB FastText model |
| `vendor/fastText/` | vendored FastText binary source |

`README.md` reports 3,782 confirmed sections. The four current
`labeled-candidates.jsonl` files contain 3,794 rows. Reconcile duplicates and
invalid/filtered rows before reporting or rebuilding a baseline.

Current training uses the section heading plus the first 1,500 characters,
holds out whole books by hash, balances classes, and trains CPU FastText. The
baseline README reports 91.9% overall accuracy and 74.4% macro recall. Russian
front-matter and reference support remains too small for a final-quality claim.

## Design

### 1. Preserve parser evidence

Extend parsed-section features without discarding the current fields.

- Keep the EPUB title and extract a separate first in-text heading when one is
  present. A parser-generated fallback such as `Chapter 25` is never treated as
  evidence.
- Derive bounded text samples from the start, middle and end. A glossary or
  bibliography often identifies itself after the first paragraph.
- Calculate book-relative features: position ratio, first/last decile, word
  count, word-count bucket, and size relative to the book's median section.
- Detect low-cost patterns: dot leaders and page numbers in a TOC, dense
  numbered entries, footnote backlinks, dictionary-style definitions,
  citation-like lines, repeated headings and repeated source-file prefixes.
- Preserve recognised `epub:type`, `isLinear`, source href and navigation order
  as high-value structural evidence.

These features are generated for every section once per parsed book. They are
also stored in the offline training records so training and import use the same
representation.

### 2. Detect boundaries before assigning roles

Create a binary decision for each boundary between adjacent parsed sections:

`STARTS_NEW_SECTION` or `CONTINUES_PREVIOUS_SECTION`.

The boundary input includes the previous section's tail, title, word-count
bucket and predicted signals, the current section's heading and beginning, and
the next section's heading and beginning. Book-relative position and run length
are included as explicit tokens or numeric rule features.

High-confidence continuation boundaries form a group. A run of tiny sections
is evidence, never sufficient by itself. It must also show continuity such as
consecutive note numbers, shared reference syntax, a parent heading such as
`Примечания`, or continuation-like text. Genuine short chapters, poems and
separate TOC items are negative examples.

Apply automatic joins only when the boundary confidence clears a deliberately
high threshold. Reuse the existing chapter merge and restore behaviour so a
user can split an incorrect join. Preserve system provenance separately from a
manual edit while retaining the normal merge lineage visible to the user.

### 3. Classify groups, not only raw EPUB pieces

After grouping, run rules and FastText on the effective section.

- EPUB semantic types still take priority when they are explicit and valid.
- Deterministic structural rules identify obvious navigation, front matter,
  reference and back matter.
- FastText receives the group heading plus sampled group text and feature
  tokens, rather than only the first raw EPUB piece.
- At low confidence, retain rules and leave the section available for manual
  correction.

This avoids the fragile cascade of classifying `MAIN` first and attempting to
repair only its mistakes later. `MAIN` is the outcome for a coherent group that
has no reliable supporting-section evidence.

### 4. Use two small models only if measurement justifies both

Keep the existing six-way FastText role classifier. Add a second binary
FastText boundary classifier only after a held-out evaluation shows it improves
false `MAIN` labels or reduces manual merges.

The binary training format can use explicit context markers:

```text
__label__continues PREV_TITLE ... PREV_TAIL ... CUR_TITLE ... CUR_HEAD ... NEXT_TITLE ...
```

Feature tokens stay stable and language-neutral where possible, for example
`POSITION_LAST_DECILE`, `WORDS_TINY`, `RUN_12`, `HAS_NOTE_BACKLINK` and
`TOC_DOT_LEADERS`.

A small decision tree or logistic model over FastText probabilities and
structural features is an optional later experiment. It must be compared to the
two-FastText pipeline against the same book-held-out set. A custom perceptron
or neural network trained from scratch is not planned because current labeled
data is too limited for it to improve reliably.

## Data collection and evaluation

Add book-level review records, never isolated rows only.

1. Select real English and Russian books with known bad imports.
2. Show neighbouring raw sections together.
3. Label each boundary as new or continuation.
4. Assign the final role to the resulting group.
5. Record manual splits, merges and role corrections as confirmed examples.
6. Include difficult counterexamples: tiny real chapters, poems, quoted
   fragments, TOC rows, notes, glossaries, appendices and long front matter.
7. Split train, validation and test by book. No sections from the same book may
   appear in more than one split.

Report by language and role:

- overall and macro role recall;
- `MAIN` precision, especially false-main front matter and references;
- boundary precision and recall;
- automatic merge precision;
- percentage of books that still need a manual merge or split.

The release gate is improvement over the existing FastText plus rules baseline
on untouched real books, with no unacceptable increase in false merges.

## Jev research result

Jev can return fixed choices and calibrated-looking confidence values, which
makes it suitable for an offline benchmark of narrow decisions such as whether
a boundary continues the previous section. It is not a local CPU dependency.

Do not use Jev outputs as training labels for FastText unless TypeSafe provides
written permission. Its published agreement prohibits using service output to
train a model that imitates it. Human-confirmed labels remain the training
source. Jev could later be evaluated as a paid review/triage service on low
confidence cases, with book-text privacy and operating cost assessed first.

## Implementation order

- [ ] Reconcile current label-row counts and create immutable book-held-out
  baseline metrics for both languages.
- [ ] Add offline extraction of in-text headings, text samples and structural
  features to `narrator-fastText` records.
- [ ] Design the boundary-review JSONL format and label a first real-book set.
- [ ] Train and evaluate the boundary FastText model offline.
- [ ] Add a deterministic, explainable boundary candidate scorer to the backend
  behind a temporary import toggle.
- [ ] Integrate only high-confidence grouping with existing merge/restore
  history and write regression tests for notes, glossary entries and real short
  chapters.
- [ ] Retrain the role model on grouped sections plus feature tokens, then
  compare it against the unchanged baseline by book and language.
- [ ] Enable the pipeline for controlled imports, save user corrections, and
  schedule retraining only after enough new confirmed book-level examples.

## Files likely to change

Backend:

- `src/books/epub-parser.service.ts`
- `src/books/types/parsed-epub.type.ts`
- `src/books/fasttext-chapter-classifier.service.ts`
- `src/books/chapter-classifier.ts`
- `src/books/book-parsing.service.ts`
- `src/books/chapter-curation.service.ts`
- adjacent unit tests, feature docs and schema only if merge provenance needs a
  new persisted value.

Training workspace:

- `prepare.py`
- `make_label_batches.py` and label merge scripts
- new boundary dataset builder and evaluator
- `build_training_data.py`
- `labeling-prompt.md`
- `models/` after an evaluation-approved replacement.

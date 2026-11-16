# Chapter-classification feedback dataset

Status: deferred. Preserve reviewed manual chapter-type corrections as a
privacy-safe training dataset for a later small classifier.

The current curation mutation overwrites the parser's role with `USER`, so it
cannot by itself tell what the parser predicted or whether a user corrected it.

## Required record

When a user changes a parser-created chapter's role, append one immutable
feedback record containing:

- the parser's original role, source, confidence, reason, and classifier
  version;
- the user-selected role and whether it differs from the parser result;
- safe training features available at import time (title, TOC/EPUB semantics,
  spine position, word-count bucket, and a content fingerprint); and
- timestamps, book language, and an explicit dataset-consent state.

Do not copy raw chapter text into feedback rows or automatically export it.
Any later training export must be owner-authorized, de-identified, access
controlled, and include only consented examples. Text/title edits, manually
created/merged chapters, and bulk updates need an explicit inclusion decision;
they are not automatically parser-correction labels.

## Later use

Export reviewed corrections only after there are enough examples per role;
split train/evaluation data by book, not by chapter, so a single book cannot
appear in both. Keep the deterministic parser as the fallback until a candidate
classifier beats it on that held-out set.

This is data collection only; it does not add an AI model or change a user's
saved curation choice.

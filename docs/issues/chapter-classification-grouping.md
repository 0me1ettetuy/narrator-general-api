# FastText chapter grouping

Status: deferred. FastText currently classifies each EPUB spine entry alone.

## Problem

Supporting material can be split across many adjacent EPUB entries. In the
local import of *Beren and Lúthien*, the `Примечания` heading and most numbered
note entries were predicted as `MAIN`, although they are one notes section.

Do not add a one-off notes rule. First collect real failed imports and identify
reliable grouping evidence: adjacent spine order, headings, size, numbering,
repeated format, and text continuation. Group only high-confidence runs;
ambiguous entries remain separate and editable.

## Exit criteria

- A book-held-out evaluation shows grouped classification improves reference
  recall without incorrectly joining real short chapters.
- Regression tests cover notes, glossary/reference runs, and short chapters.

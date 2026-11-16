# Planned EPUB section taxonomy

This is the eight-class vocabulary for the future chapter-type classifier and
user-facing explanations. It groups the much larger EPUB semantic vocabulary
into labels that are understandable and useful in Narrator.

Status: deferred.

## Rules

- Assign one type per parsed section.
- `includeInDefaultNarration` remains a separate decision. A type explains
  what a section is; it never decides whether it should be narrated.
- These are Narrator labels, not a claim that EPUB has only eight types. Common
  EPUB terms below are examples for UI help and teacher-labeling prompts.

| Label | User-facing name | Common EPUB sections grouped here |
| --- | --- | --- |
| `cover` | Cover | cover image, cover title, marketing copy or reviews on the cover |
| `navigation` | Navigation | table of contents (`toc`), landmarks, list of illustrations, tables, audio, or video |
| `frontmatter` | Beginning pages | half title, title page, copyright page, dedication, epigraph, foreword, preface, introduction, preamble |
| `content` | Main content | volume, part, chapter, division, prologue, epilogue, conclusion, poems or the main instructional text |
| `supplement` | Supplementary content | appendix, afterword, acknowledgments, credits, author note, supporting material |
| `reference` | References and notes | footnotes, endnotes, bibliography, glossary, dictionary, index, citations |
| `backmatter` | End pages | colophon, imprint, publisher information, advertisements, edition or production pages |
| `other` | Other or unknown | blank or image-only sections, non-linear resources, malformed content, or a section that cannot be classified safely |

## UI wording

Show the user-facing name in a chapter badge. In an information panel, use the
description in the table and make it clear that they can still choose whether
that section is narrated. Do not expose `epub:type` jargon unless it helps
diagnose an import.

## Relation to EPUB

EPUB's official structural semantics include partitions (`cover`,
`frontmatter`, `bodymatter`, `backmatter`), divisions (`volume`, `part`,
`chapter`, `division`), navigation, reference material, notes, and many
specialized dictionary, educational, and comics terms. This taxonomy groups
the section-level terms relevant to audiobook outlines; it deliberately does
not model every inline or specialist EPUB term.

Source: [W3C EPUB Structural Semantics Vocabulary](https://www.w3.org/TR/epub-ssv/).

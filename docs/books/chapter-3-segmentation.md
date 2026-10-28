# Chapter 3 segmentation check

This report uses the production `ChapterSegmenter` locally against the
2,150-word chapter `3. Передышка`. It makes no TTS, Redis, or R2 request.

## Input

- Chapter text: 13,242 characters / 2,150 words
- Configured segment limit: 4,000 characters
- Segments created: 5

| Segment | Characters | Words | Limit used |
| --- | ---: | ---: | ---: |
| 1 | 2,377 | 385 | 59.4% |
| 2 | 2,695 | 423 | 67.4% |
| 3 | 2,992 | 501 | 74.8% |
| 4 | 3,700 | 604 | 92.5% |
| 5 | 1,471 | 237 | 36.8% |

## Result

The segmenter is respecting the 4,000-character limit. The first request is
only 2,377 characters, so the observed 60-second failure cannot be explained
solely by a 4,000-character first segment. The next diagnostic step is to send
that exact first segment directly to the provider and measure its response
time.

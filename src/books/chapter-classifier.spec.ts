import { classifyChapter } from './chapter-classifier.js';

describe('classifyChapter', () => {
  const chapter = {
    position: 0,
    title: 'Chapter one',
    sourceHref: 'text/chapter-1.xhtml',
    text: 'A readable chapter.',
    wordCount: 3,
    semanticTypes: [],
    isLinear: true,
  };

  it('excludes a semantic EPUB table of contents by default', () => {
    expect(classifyChapter({ ...chapter, semanticTypes: ['toc'] })).toEqual({
      role: 'NAVIGATION',
      includeInDefaultNarration: false,
      source: 'EPUB',
      confidence: 'HIGH',
      reason: 'EPUB_TOC',
    });
  });

  it('uses low-confidence title hints without looking at chapter length', () => {
    expect(
      classifyChapter({ ...chapter, title: 'Contents', wordCount: 2 }),
    ).toEqual({
      role: 'NAVIGATION',
      includeInDefaultNarration: false,
      source: 'HEURISTIC',
      confidence: 'LOW',
      reason: 'HEURISTIC_TOC_TITLE',
    });
  });

  it('keeps an unclassified short chapter in default narration', () => {
    expect(
      classifyChapter({
        ...chapter,
        title: 'I',
        text: 'A poem.',
        wordCount: 2,
      }),
    ).toEqual({
      role: 'MAIN',
      includeInDefaultNarration: true,
      source: 'EPUB',
      confidence: null,
      reason: null,
    });
  });
});

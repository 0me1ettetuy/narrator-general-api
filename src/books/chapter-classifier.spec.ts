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

  it('ignores the file path when guessing from hints', () => {
    for (const sourceHref of [
      'content/ch1.xhtml',
      'text/index_split_005.html',
    ]) {
      expect(classifyChapter({ ...chapter, sourceHref }).role).toBe('MAIN');
    }
  });

  it('matches whole words only', () => {
    for (const title of ['The Notebook', 'Referee', 'Indexing the Past']) {
      expect(classifyChapter({ ...chapter, title }).role).toBe('MAIN');
    }
  });

  it('recognises Cyrillic hints', () => {
    expect(classifyChapter({ ...chapter, title: 'Оглавление' }).role).toBe(
      'NAVIGATION',
    );
    expect(classifyChapter({ ...chapter, title: 'Приложения' }).role).toBe(
      'BACK_MATTER',
    );
  });
});

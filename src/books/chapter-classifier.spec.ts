import { classifyChapter } from './chapter-classifier.js';

describe('classifyChapter', () => {
  const chapter = {
    position: 0,
    title: 'Chapter one',
    sourceHref: 'text/chapter-1.xhtml',
    text: 'A readable chapter.',
    wordCount: 500,
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

  it('treats a section of 100 words or fewer as not main', () => {
    expect(
      classifyChapter({
        ...chapter,
        title: 'I',
        text: 'A poem.',
        wordCount: 2,
      }),
    ).toEqual({
      role: 'OTHER',
      includeInDefaultNarration: false,
      source: 'HEURISTIC',
      confidence: 'LOW',
      reason: 'NO_MAIN_EVIDENCE',
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
      expect(classifyChapter({ ...chapter, title, wordCount: 500 }).role).toBe(
        'MAIN',
      );
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

describe('classifyChapter narration', () => {
  it('narrates only MAIN', () => {
    const base = {
      position: 0,
      title: 'Preface',
      sourceHref: 'a.xhtml',
      text: 't',
      wordCount: 1,
      semanticTypes: [],
      isLinear: true,
    };
    expect(classifyChapter(base).includeInDefaultNarration).toBe(false);
    expect(
      classifyChapter({ ...base, title: 'Chapter 1', wordCount: 500 })
        .includeInDefaultNarration,
    ).toBe(true);
  });
});

describe('classifyChapter main evidence', () => {
  const base = {
    position: 0,
    title: 'The Blue Castle',
    sourceHref: 'a.xhtml',
    text: 't',
    wordCount: 50,
    semanticTypes: [],
    isLinear: true,
  };

  it('marks a short section without evidence as OTHER', () => {
    expect(classifyChapter(base).role).toBe('OTHER');
  });

  it('marks a long section or a chapter-style title as MAIN', () => {
    expect(classifyChapter({ ...base, wordCount: 2000 }).role).toBe('MAIN');
    expect(
      classifyChapter({ ...base, title: 'Глава XVII', wordCount: 150 }).role,
    ).toBe('MAIN');
  });
});

describe('classifyChapter opening text', () => {
  const base = {
    position: 0,
    title: 'Chapter 9',
    sourceHref: 'a.xhtml',
    wordCount: 500,
    semanticTypes: [],
    isLinear: true,
  };

  it('uses the first words after the title', () => {
    const roleOf = (text: string) => classifyChapter({ ...base, text }).role;

    expect(roleOf('Chapter 9 Chapter 9 FOOTNOTES: [1] See above.')).toBe(
      'REFERENCE',
    );
    expect(roleOf('Contents I A Shipwreck 15 II A Landing 28')).toBe(
      'NAVIGATION',
    );
    expect(roleOf('End of the Project Gutenberg eBook of X')).toBe(
      'BACK_MATTER',
    );
  });

  it('keeps a normal chapter that merely mentions a note', () => {
    expect(
      classifyChapter({ ...base, text: 'Note that he never came back.' }).role,
    ).toBe('MAIN');
  });
});

describe('classifyChapter Cyrillic anchoring', () => {
  it('only matches opening words at the start of the text', () => {
    const chapter = {
      position: 0,
      title: 'Глава V',
      sourceHref: 'a.xhtml',
      text: 'Часть первая — Ну, что ты сделал? — спросил он. Примечание: ничего.',
      wordCount: 500,
      semanticTypes: [],
      isLinear: true,
    };
    expect(classifyChapter(chapter).role).toBe('MAIN');
  });
});

describe('classifyChapter roman numeral titles', () => {
  const chapter = {
    position: 0,
    sourceHref: 'a.xhtml',
    text: 't',
    wordCount: 150,
    semanticTypes: [],
    isLinear: true,
  };

  it('accepts real numerals but not words made of numeral letters', () => {
    expect(classifyChapter({ ...chapter, title: 'XIV.' }).role).toBe('MAIN');
    expect(classifyChapter({ ...chapter, title: 'CIVIL' }).role).toBe('OTHER');
  });
});

import type {
  ChapterClassificationConfidence,
  ChapterClassificationSource,
  ChapterRole,
} from './contracts/books.response.js';
import type { ParsedEpubChapter } from './types/parsed-epub.type.js';

export type ChapterClassification = {
  role: ChapterRole;
  includeInDefaultNarration: boolean;
  source: ChapterClassificationSource;
  confidence: ChapterClassificationConfidence | null;
  reason: string | null;
};

const SEMANTIC_ROLE_BY_TYPE: Record<
  string,
  Omit<ChapterClassification, 'source'>
> = {
  appendix: {
    role: 'BACK_MATTER',
    includeInDefaultNarration: true,
    confidence: 'HIGH',
    reason: 'EPUB_APPENDIX',
  },
  acknowledgments: {
    role: 'BACK_MATTER',
    includeInDefaultNarration: true,
    confidence: 'HIGH',
    reason: 'EPUB_ACKNOWLEDGMENTS',
  },
  afterword: {
    role: 'BACK_MATTER',
    includeInDefaultNarration: true,
    confidence: 'HIGH',
    reason: 'EPUB_AFTERWORD',
  },
  backmatter: {
    role: 'BACK_MATTER',
    includeInDefaultNarration: true,
    confidence: 'HIGH',
    reason: 'EPUB_BACK_MATTER',
  },
  bibliography: {
    role: 'REFERENCE',
    includeInDefaultNarration: false,
    confidence: 'HIGH',
    reason: 'EPUB_BIBLIOGRAPHY',
  },
  bodymatter: {
    role: 'MAIN',
    includeInDefaultNarration: true,
    confidence: 'HIGH',
    reason: 'EPUB_BODY_MATTER',
  },
  colophon: {
    role: 'BACK_MATTER',
    includeInDefaultNarration: true,
    confidence: 'HIGH',
    reason: 'EPUB_COLOPHON',
  },
  'copyright-page': {
    role: 'FRONT_MATTER',
    includeInDefaultNarration: true,
    confidence: 'HIGH',
    reason: 'EPUB_COPYRIGHT_PAGE',
  },
  dedication: {
    role: 'FRONT_MATTER',
    includeInDefaultNarration: true,
    confidence: 'HIGH',
    reason: 'EPUB_DEDICATION',
  },
  endnotes: {
    role: 'REFERENCE',
    includeInDefaultNarration: false,
    confidence: 'HIGH',
    reason: 'EPUB_ENDNOTES',
  },
  footnotes: {
    role: 'REFERENCE',
    includeInDefaultNarration: false,
    confidence: 'HIGH',
    reason: 'EPUB_FOOTNOTES',
  },
  foreword: {
    role: 'FRONT_MATTER',
    includeInDefaultNarration: true,
    confidence: 'HIGH',
    reason: 'EPUB_FOREWORD',
  },
  frontmatter: {
    role: 'FRONT_MATTER',
    includeInDefaultNarration: true,
    confidence: 'HIGH',
    reason: 'EPUB_FRONT_MATTER',
  },
  glossary: {
    role: 'REFERENCE',
    includeInDefaultNarration: false,
    confidence: 'HIGH',
    reason: 'EPUB_GLOSSARY',
  },
  index: {
    role: 'REFERENCE',
    includeInDefaultNarration: false,
    confidence: 'HIGH',
    reason: 'EPUB_INDEX',
  },
  introduction: {
    role: 'FRONT_MATTER',
    includeInDefaultNarration: true,
    confidence: 'HIGH',
    reason: 'EPUB_INTRODUCTION',
  },
  loi: {
    role: 'NAVIGATION',
    includeInDefaultNarration: false,
    confidence: 'HIGH',
    reason: 'EPUB_LIST_OF_ILLUSTRATIONS',
  },
  lot: {
    role: 'NAVIGATION',
    includeInDefaultNarration: false,
    confidence: 'HIGH',
    reason: 'EPUB_LIST_OF_TABLES',
  },
  notes: {
    role: 'REFERENCE',
    includeInDefaultNarration: false,
    confidence: 'HIGH',
    reason: 'EPUB_NOTES',
  },
  preface: {
    role: 'FRONT_MATTER',
    includeInDefaultNarration: true,
    confidence: 'HIGH',
    reason: 'EPUB_PREFACE',
  },
  titlepage: {
    role: 'FRONT_MATTER',
    includeInDefaultNarration: true,
    confidence: 'HIGH',
    reason: 'EPUB_TITLE_PAGE',
  },
  toc: {
    role: 'NAVIGATION',
    includeInDefaultNarration: false,
    confidence: 'HIGH',
    reason: 'EPUB_TOC',
  },
};

const HEURISTIC_ROLE_BY_PATTERN: Array<{
  pattern: RegExp;
  role: ChapterRole;
  includeInDefaultNarration: boolean;
  reason: string;
}> = [
  {
    pattern:
      /(?:^|\b)(?:contents?|table[- ]of[- ]contents?|оглавление|содержание)(?:\b|$)/iu,
    role: 'NAVIGATION',
    includeInDefaultNarration: false,
    reason: 'HEURISTIC_TOC_TITLE',
  },
  {
    pattern:
      /(?:^|\b)(?:index|glossary|bibliography|references?|notes?|указатель|глоссарий|библиограф)/iu,
    role: 'REFERENCE',
    includeInDefaultNarration: false,
    reason: 'HEURISTIC_REFERENCE_TITLE',
  },
  {
    pattern:
      /(?:^|\b)(?:copyright|title[- ]page|dedication|preface|foreword|введение|посвящение|авторские права)/iu,
    role: 'FRONT_MATTER',
    includeInDefaultNarration: true,
    reason: 'HEURISTIC_FRONT_MATTER_TITLE',
  },
  {
    pattern:
      /(?:^|\b)(?:appendix|afterword|acknowledg(?:e)?ments?|colophon|приложени|послесловие|благодарност)/iu,
    role: 'BACK_MATTER',
    includeInDefaultNarration: true,
    reason: 'HEURISTIC_BACK_MATTER_TITLE',
  },
];

export function classifyChapter(
  chapter: ParsedEpubChapter,
): ChapterClassification {
  for (const semanticType of chapter.semanticTypes ?? []) {
    const semanticClassification = SEMANTIC_ROLE_BY_TYPE[semanticType];

    if (semanticClassification) {
      return { ...semanticClassification, source: 'EPUB' };
    }
  }

  const heuristicInput = `${chapter.title} ${chapter.sourceHref}`.toLowerCase();
  for (const heuristic of HEURISTIC_ROLE_BY_PATTERN) {
    if (heuristic.pattern.test(heuristicInput)) {
      return {
        role: heuristic.role,
        includeInDefaultNarration: heuristic.includeInDefaultNarration,
        source: 'HEURISTIC',
        confidence: 'LOW',
        reason: heuristic.reason,
      };
    }
  }

  if (!chapter.isLinear) {
    return {
      role: 'OTHER',
      includeInDefaultNarration: false,
      source: 'EPUB',
      confidence: 'LOW',
      reason: 'EPUB_NONLINEAR_SPINE',
    };
  }

  return {
    role: 'MAIN',
    includeInDefaultNarration: true,
    source: 'EPUB',
    confidence: null,
    reason: null,
  };
}

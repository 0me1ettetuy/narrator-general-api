import { parse, type Chapter } from '@abfcode/spine';
import { Injectable } from '@nestjs/common';
import type {
  ParsedEpub,
  ParsedEpubChapter,
} from './types/parsed-epub.type.js';

const MAX_EPUB_INFLATED_ENTRY_BYTES = 16 * 1024 * 1024;

@Injectable()
export class EpubParserService {
  parse(epubBytes: Uint8Array): ParsedEpub {
    const book = parse(epubBytes, {
      maxInflatedBytes: MAX_EPUB_INFLATED_ENTRY_BYTES,
    });
    const chapters = Array.from(book.iterChapters())
      .map(toParsedEpubChapter)
      .filter((chapter): chapter is ParsedEpubChapter => chapter !== null)
      .map((chapter, position) => ({ ...chapter, position }));

    if (chapters.length === 0) {
      throw new Error('EPUB contains no readable chapters');
    }

    return {
      title: normalizeText(book.metadata.title) || null,
      authors: uniqueNonEmpty(book.metadata.authors.map(normalizeText)),
      chapters,
    };
  }
}

function toParsedEpubChapter(chapter: Chapter): ParsedEpubChapter | null {
  const text = normalizeText(chapter.text);

  if (!text) {
    return null;
  }

  return {
    position: chapter.index,
    title: normalizeText(chapter.title) || `Chapter ${chapter.index + 1}`,
    sourceHref: chapter.href,
    text,
    wordCount: countWords(text),
  };
}

function normalizeText(value: string): string {
  return value
    .replace(/\r\n?/gu, '\n')
    .replace(/\u00a0/gu, ' ')
    .replace(/[^\S\n]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function countWords(text: string): number {
  return text.split(/\s+/u).length;
}

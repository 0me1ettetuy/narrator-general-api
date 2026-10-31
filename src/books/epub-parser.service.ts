import { parse, type Book, type Chapter, type Cover } from '@abfcode/spine';
import { franc } from 'franc';
import { Injectable } from '@nestjs/common';
import type {
  ParsedEpub,
  ParsedEpubChapter,
  ParsedEpubCover,
} from './types/parsed-epub.type.js';

const MAX_EPUB_INFLATED_ENTRY_BYTES = 16 * 1024 * 1024;
const MAX_COVER_BYTES = 10 * 1024 * 1024;
const COVER_MIME_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

@Injectable()
export class EpubParserService {
  parse(epubBytes: Uint8Array): ParsedEpub {
    const book = parse(epubBytes, {
      maxInflatedBytes: MAX_EPUB_INFLATED_ENTRY_BYTES,
    });
    const chapters = Array.from(book.iterChapters())
      .map((chapter) => toParsedEpubChapter(book, chapter))
      .filter((chapter): chapter is ParsedEpubChapter => chapter !== null)
      .map((chapter, position) => ({ ...chapter, position }));

    if (chapters.length === 0) {
      throw new Error('EPUB contains no readable chapters');
    }

    return {
      title: normalizeText(book.metadata.title) || null,
      language:
        normalizeText(book.metadata.language) || detectLanguage(chapters),
      authors: uniqueNonEmpty(book.metadata.authors.map(normalizeText)),
      cover: readCover(book),
      chapters,
    };
  }
}

function detectLanguage(chapters: ParsedEpubChapter[]): string | null {
  const detectedLanguage = franc(
    chapters.map((chapter) => chapter.text).join('\n'),
  );

  if (detectedLanguage === 'und') {
    return null;
  }

  try {
    return new Intl.Locale(detectedLanguage).language || null;
  } catch {
    return null;
  }
}

function readCover(book: Book): ParsedEpubCover | null {
  try {
    return toParsedEpubCover(book.cover());
  } catch {
    return null;
  }
}

function toParsedEpubCover(cover: Cover | undefined): ParsedEpubCover | null {
  if (!cover || cover.bytes.byteLength > MAX_COVER_BYTES) {
    return null;
  }

  const mimeType = normalizeCoverMimeType(cover.contentType);

  if (!mimeType || !COVER_MIME_TYPES.has(mimeType)) {
    return null;
  }

  return { bytes: cover.bytes, mimeType };
}

function normalizeCoverMimeType(contentType: string): string | null {
  const normalized = contentType.split(';', 1)[0]?.trim().toLowerCase();

  if (normalized === 'image/jpg') {
    return 'image/jpeg';
  }

  return normalized || null;
}

function toParsedEpubChapter(
  book: Book,
  chapter: Chapter,
): ParsedEpubChapter | null {
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
    semanticTypes: getChapterSemanticTypes(book, chapter),
    isLinear: book.spine?.[chapter.start?.spineIndex]?.linear ?? true,
  };
}

function getChapterSemanticTypes(book: Book, chapter: Chapter): string[] {
  try {
    return [
      ...new Set(
        book
          .blocksInRange(chapter.start, chapter.end)
          .map((block) => block.epubType)
          .filter((value): value is string => Boolean(value))
          .flatMap((value) => value.toLowerCase().split(/\s+/u)),
      ),
    ];
  } catch {
    return [];
  }
}

function normalizeText(value: string | undefined): string {
  return (
    value
      ?.replace(/\r\n?/gu, '\n')
      .replace(/\u00a0/gu, ' ')
      .replace(/[^\S\n]+/gu, ' ')
      .replace(/ *\n */gu, '\n')
      .replace(/\n{3,}/gu, '\n\n')
      .trim() ?? ''
  );
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function countWords(text: string): number {
  return text.split(/\s+/u).length;
}

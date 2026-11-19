import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import type { ParsedEpubChapter } from './types/parsed-epub.type.js';

const FASTTEXT_MODEL_PATH = join(process.cwd(), 'models', 'chapter-type.ftz');
const FASTTEXT_CONFIDENCE = 0.7;
const TEMPORARY_DIRECTORY_PREFIX = 'narrator-fasttext-';
const INPUT_FILENAME = 'chapters.txt';
const CONTENTS_HINT_PATTERN =
  /\b(contents?|table of contents|toc|оглавлени[ея]|содержани[ея])\b/iu;

const FASTTEXT_LABELS = new Set([
  'backmatter',
  'content',
  'frontmatter',
  'navigation',
  'reference',
  'supplement',
]);

export type FastTextChapterPrediction = {
  label: string;
  confidence: number;
};

@Injectable()
export class FastTextChapterClassifierService {
  private readonly logger = new Logger(FastTextChapterClassifierService.name);

  async predict(
    chapters: ParsedEpubChapter[],
    language: string | null,
  ): Promise<Array<FastTextChapterPrediction | null>> {
    if (!chapters.length) {
      return [];
    }

    const workingDirectory = await mkdtemp(
      join(tmpdir(), TEMPORARY_DIRECTORY_PREFIX),
    );

    try {
      const inputPath = join(workingDirectory, INPUT_FILENAME);
      await writeFile(
        inputPath,
        chapters
          .map((chapter, index) =>
            toFastTextInput(chapter, index, chapters.length, language),
          )
          .join('\n'),
        'utf8',
      );
      const predictions = parsePredictions(await runFastText(inputPath));

      if (predictions.length !== chapters.length) {
        throw new Error('FastText returned an incomplete prediction set');
      }

      return predictions;
    } catch {
      this.logger.warn(
        'Chapter classifier unavailable; keeping rule-based classifications',
      );
      return chapters.map(() => null);
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  }
}

export function toFastTextInput(
  chapter: ParsedEpubChapter,
  index: number,
  chapterCount: number,
  language: string | null,
): string {
  const text = normalizeWhitespace(chapter.text);
  const position = index / Math.max(chapterCount - 1, 1);
  // shortcut: link counts are not preserved by the parser, add them when retraining proves they matter.
  const features = [
    `meta_lang_${normalizeLanguage(language)}`,
    `meta_position_${position < 0.2 ? 'start' : position > 0.8 ? 'end' : 'middle'}`,
    `meta_size_${chapter.wordCount < 200 ? 'short' : chapter.wordCount >= 1000 ? 'long' : 'medium'}`,
    'meta_links_sparse',
    CONTENTS_HINT_PATTERN.test(`${chapter.title} ${text.slice(0, 500)}`)
      ? 'meta_contents_hint'
      : 'meta_no_contents_hint',
  ];

  return [
    normalizeWhitespace(chapter.title),
    text.slice(0, 1500),
    text.length > 1500 ? text.slice(-500) : '',
    ...features,
  ]
    .filter(Boolean)
    .join(' ');
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function normalizeLanguage(language: string | null): string {
  return language?.toLowerCase().match(/^[a-z]{2,3}/u)?.[0] ?? 'und';
}

async function runFastText(inputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(
      'fasttext',
      ['predict-prob', FASTTEXT_MODEL_PATH, inputPath, '1'],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    let output = '';

    process.stdout.setEncoding('utf8');
    process.stdout.on('data', (chunk: string) => {
      output += chunk;
    });
    process.once('error', () => {
      reject(new Error('FastText could not be started'));
    });
    process.once('close', (code) => {
      if (code === 0) {
        resolve(output);
        return;
      }

      reject(new Error('FastText prediction failed'));
    });
  });
}

function parsePredictions(
  output: string,
): Array<FastTextChapterPrediction | null> {
  return output
    .trimEnd()
    .split('\n')
    .map((line) => {
      const [rawLabel, rawConfidence] = line.trim().split(/\s+/u);
      const label = rawLabel?.replace('__label__', '');
      const confidence = Number(rawConfidence);

      if (
        !label ||
        !FASTTEXT_LABELS.has(label) ||
        !Number.isFinite(confidence) ||
        confidence < FASTTEXT_CONFIDENCE
      ) {
        return null;
      }

      return { label, confidence };
    });
}

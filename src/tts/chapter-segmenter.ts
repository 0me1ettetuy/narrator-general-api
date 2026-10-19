export const DEFAULT_TTS_SEGMENT_MAX_CHARACTERS = 4_000;

export class ChapterSegmenter {
  constructor(
    private readonly maxCharacters = DEFAULT_TTS_SEGMENT_MAX_CHARACTERS,
  ) {
    if (!Number.isSafeInteger(maxCharacters) || maxCharacters < 1) {
      throw new Error('TTS segment maximum must be a positive integer');
    }
  }

  segment(chapterText: string): string[] {
    const paragraphs = chapterText
      .trim()
      .split(/\n\s*\n/u)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);

    const segments: string[] = [];
    let currentSegment = '';

    for (const paragraph of paragraphs) {
      if (paragraph.length <= this.maxCharacters) {
        currentSegment = this.appendParagraph(
          segments,
          currentSegment,
          paragraph,
        );
        continue;
      }

      if (currentSegment) {
        segments.push(currentSegment);
        currentSegment = '';
      }

      const paragraphSegments = this.splitOversizedParagraph(paragraph);

      for (const [index, paragraphSegment] of paragraphSegments.entries()) {
        const isLastParagraphSegment = index === paragraphSegments.length - 1;

        if (isLastParagraphSegment) {
          currentSegment = paragraphSegment;
        } else {
          segments.push(paragraphSegment);
        }
      }
    }

    if (currentSegment) {
      segments.push(currentSegment);
    }

    return segments;
  }

  private appendParagraph(
    segments: string[],
    currentSegment: string,
    paragraph: string,
  ): string {
    if (!currentSegment) {
      return paragraph;
    }

    const combined = `${currentSegment}\n\n${paragraph}`;

    if (combined.length <= this.maxCharacters) {
      return combined;
    }

    segments.push(currentSegment);

    return paragraph;
  }

  private splitOversizedParagraph(paragraph: string): string[] {
    const sentences = Array.from(
      new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(
        paragraph,
      ),
      ({ segment }) => segment.trim(),
    ).filter(Boolean);

    if (!sentences.length) {
      return this.splitOversizedSentence(paragraph);
    }

    const segments: string[] = [];
    let currentSegment = '';

    for (const sentence of sentences) {
      const sentenceSegments =
        sentence.length <= this.maxCharacters
          ? [sentence]
          : this.splitOversizedSentence(sentence);

      for (const sentenceSegment of sentenceSegments) {
        if (!currentSegment) {
          currentSegment = sentenceSegment;
          continue;
        }

        const combined = `${currentSegment} ${sentenceSegment}`;

        if (combined.length <= this.maxCharacters) {
          currentSegment = combined;
          continue;
        }

        segments.push(currentSegment);
        currentSegment = sentenceSegment;
      }
    }

    if (currentSegment) {
      segments.push(currentSegment);
    }

    return segments;
  }

  private splitOversizedSentence(sentence: string): string[] {
    const words = sentence.trim().split(/\s+/u).filter(Boolean);
    const segments: string[] = [];
    let currentSegment = '';

    for (const word of words) {
      const wordsToAdd =
        word.length <= this.maxCharacters
          ? [word]
          : this.splitOversizedWord(word);

      for (const wordPart of wordsToAdd) {
        if (!currentSegment) {
          currentSegment = wordPart;
          continue;
        }

        const combined = `${currentSegment} ${wordPart}`;

        if (combined.length <= this.maxCharacters) {
          currentSegment = combined;
          continue;
        }

        segments.push(currentSegment);
        currentSegment = wordPart;
      }
    }

    if (currentSegment) {
      segments.push(currentSegment);
    }

    return segments;
  }

  private splitOversizedWord(word: string): string[] {
    const segments: string[] = [];

    for (let index = 0; index < word.length; index += this.maxCharacters) {
      segments.push(word.slice(index, index + this.maxCharacters));
    }

    return segments;
  }
}

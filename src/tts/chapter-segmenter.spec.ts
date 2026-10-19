import {
  ChapterSegmenter,
  DEFAULT_TTS_SEGMENT_MAX_CHARACTERS,
} from './chapter-segmenter.js';

describe('ChapterSegmenter', () => {
  it('packs complete paragraphs together while they fit', () => {
    const segmenter = new ChapterSegmenter(40);

    expect(
      segmenter.segment('First paragraph.\n\nSecond paragraph.\n\nThird.'),
    ).toEqual(['First paragraph.\n\nSecond paragraph.', 'Third.']);
  });

  it('splits an oversized paragraph at sentence boundaries', () => {
    const segmenter = new ChapterSegmenter(35);

    expect(
      segmenter.segment(
        'First sentence is short. Second sentence is also short. Third sentence ends here.',
      ),
    ).toEqual([
      'First sentence is short.',
      'Second sentence is also short.',
      'Third sentence ends here.',
    ]);
  });

  it('uses word boundaries only when one sentence exceeds the maximum', () => {
    const segmenter = new ChapterSegmenter(16);

    expect(
      segmenter.segment('One two three four five six seven eight.'),
    ).toEqual(['One two three', 'four five six', 'seven eight.']);
  });

  it('uses a hard character split only for a word longer than the maximum', () => {
    const segmenter = new ChapterSegmenter(4);

    expect(segmenter.segment('abcdefghij')).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('returns no segments for blank text and uses the shared default limit', () => {
    const segmenter = new ChapterSegmenter();

    expect(segmenter.segment(' \n\n ')).toEqual([]);
    expect(DEFAULT_TTS_SEGMENT_MAX_CHARACTERS).toBe(4_000);
  });
});

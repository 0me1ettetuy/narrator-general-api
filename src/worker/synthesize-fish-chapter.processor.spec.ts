import type { ConfigService } from '@nestjs/config';
import type { ChapterTtsService } from '../tts/chapter-tts.service.js';

jest.mock('../tts/chapter-tts.service.js', () => ({
  ChapterTtsService: class ChapterTtsService {},
}));

import { SynthesizeFishChapterProcessor } from './synthesize-fish-chapter.processor.js';

describe('SynthesizeFishChapterProcessor', () => {
  function bootstrapWith(value: string | undefined) {
    const worker = { concurrency: 1 };
    const processor = new SynthesizeFishChapterProcessor(
      {} as ChapterTtsService,
      { get: jest.fn(() => value) } as unknown as ConfigService,
    );
    Object.defineProperty(processor, 'worker', { value: worker });

    processor.onApplicationBootstrap();

    return worker.concurrency;
  }

  it('runs as many Fish chapters at once as TTS_FISH_CONCURRENCY allows', () => {
    expect(bootstrapWith('3')).toBe(3);
  });

  it.each([undefined, '', '0', '-1', '2.5', 'many'])(
    'falls back to 2 parallel Fish chapters for %p',
    (value) => {
      expect(bootstrapWith(value)).toBe(2);
    },
  );
});

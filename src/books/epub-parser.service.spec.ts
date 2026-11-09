import { parse, type Block, type Inline } from '@abfcode/spine';
import { franc } from 'franc';
import {
  findImageMarkerIds,
  formatImageMarker,
} from './chapter-image-marker.js';
import { EpubParserService } from './epub-parser.service.js';

describe('EpubParserService', () => {
  const parser = new EpubParserService();
  const parseMock = jest.mocked(parse);
  const francMock = jest.mocked(franc);

  beforeEach(() => {
    parseMock.mockReset();
    francMock.mockReset();
    francMock.mockReturnValue('und');
  });

  it('returns normalized, ordered readable chapters and book metadata', () => {
    parseMock.mockReturnValue({
      metadata: {
        title: '  A Book  ',
        language: ' ru ',
        authors: [' Author One ', 'Author One', 'Author Two'],
      },
      cover: () => ({
        bytes: new Uint8Array([1, 2, 3]),
        contentType: 'image/jpeg',
        href: 'images/cover.jpg',
      }),
      iterChapters: function* () {
        yield {
          index: 2,
          title: '  Second chapter ',
          href: 'text/second.xhtml',
          text: ' Second\r\n\r\nchapter  ',
        };
        yield {
          index: 3,
          title: 'Empty',
          href: 'text/empty.xhtml',
          text: '   ',
        };
      },
    } as never);

    expect(parser.parse(new Uint8Array([1]))).toEqual({
      title: 'A Book',
      language: 'ru',
      authors: ['Author One', 'Author Two'],
      cover: {
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: 'image/jpeg',
      },
      images: [],
      chapters: [
        {
          position: 0,
          title: 'Second chapter',
          sourceHref: 'text/second.xhtml',
          text: 'Second\n\nchapter',
          wordCount: 2,
          semanticTypes: [],
          isLinear: true,
        },
      ],
    });
  });

  it('rejects an EPUB with no readable chapters', () => {
    parseMock.mockReturnValue({
      metadata: { title: '', authors: [] },
      cover: () => undefined,
      iterChapters: function* () {
        yield {
          index: 0,
          title: 'Empty',
          href: 'text/empty.xhtml',
          text: '   ',
        };
      },
    } as never);

    expect(() => parser.parse(new Uint8Array([1]))).toThrow(
      'EPUB contains no readable chapters',
    );
  });

  it('detects the language from chapter text when EPUB metadata is missing', () => {
    francMock.mockReturnValue('eng');
    parseMock.mockReturnValue({
      metadata: { title: 'Book', authors: [] },
      cover: () => undefined,
      iterChapters: function* () {
        yield {
          index: 0,
          title: 'Chapter',
          href: 'text/chapter.xhtml',
          text: `The wind moved through the empty street while the city slept.
            Every window reflected a little piece of the moonlight.`,
        };
      },
    } as never);

    expect(parser.parse(new Uint8Array([1])).language).toBe('en');
  });

  it('keeps parsing when the optional cover cannot be read safely', () => {
    parseMock.mockReturnValue({
      metadata: { title: 'Book', authors: [] },
      cover: () => {
        throw new Error('Corrupt cover entry');
      },
      iterChapters: function* () {
        yield {
          index: 0,
          title: 'Chapter',
          href: 'text/chapter.xhtml',
          text: 'Readable chapter',
        };
      },
    } as never);

    expect(parser.parse(new Uint8Array([1])).cover).toBeNull();
  });
  describe('images', () => {
    const PNG = new Uint8Array([137, 80, 78, 71]);
    const text = (value: string): Inline => ({ kind: 'text', text: value });
    const image = (src: string, alt?: string): Inline => ({
      kind: 'image',
      src,
      alt,
    });
    const paragraph = (...inlines: Inline[]): Block => ({
      kind: 'paragraph',
      inlines,
    });

    function mockEpub(
      chapters: { text?: string; blocks: Block[] }[],
      files: Record<string, Uint8Array>,
    ) {
      parseMock.mockReturnValue({
        metadata: { title: 'Book', authors: [] },
        cover: () => undefined,
        openResource: (src: string) => files[src],
        blocksInRange: (start: { spineIndex: number }) =>
          chapters[start.spineIndex].blocks,
        iterChapters: function* () {
          for (const [index, chapter] of chapters.entries()) {
            yield {
              index,
              title: `Chapter ${index + 1}`,
              href: `text/${index}.xhtml`,
              text: chapter.text ?? 'raw library text',
              start: { spineIndex: index, blockIndex: 0 },
              end: { spineIndex: index + 1, blockIndex: 0 },
            };
          }
        },
      } as never);
    }

    it('puts a marker where an image stood and keeps its alt text out of the text', () => {
      mockEpub(
        [
          {
            blocks: [
              paragraph(text('Before')),
              paragraph(image('images/map.png', 'Map of town')),
              paragraph(text('After')),
            ],
          },
        ],
        { 'images/map.png': PNG },
      );

      const result = parser.parse(new Uint8Array([1]));
      const [stored] = result.images;

      expect(result.images).toEqual([
        {
          id: stored.id,
          bytes: PNG,
          mimeType: 'image/png',
          alt: 'Map of town',
        },
      ]);
      expect(result.chapters[0].text).toBe(
        `Before\n\n${formatImageMarker(stored.id)}\n\nAfter`,
      );
    });

    it('keeps a marker inside a sentence on the same line', () => {
      mockEpub(
        [
          {
            blocks: [
              paragraph(text('Before '), image('a.png'), text(' after.')),
            ],
          },
        ],
        { 'a.png': PNG },
      );

      const result = parser.parse(new Uint8Array([1]));

      expect(result.chapters[0].text).toBe(
        `Before ${formatImageMarker(result.images[0].id)} after.`,
      );
    });

    it('stores an image used twice once and reuses its id', () => {
      mockEpub(
        [
          {
            blocks: [
              paragraph(text('One'), image('logo.png')),
              paragraph(text('Two'), image('logo.png')),
            ],
          },
        ],
        { 'logo.png': PNG },
      );

      const result = parser.parse(new Uint8Array([1]));
      const marker = formatImageMarker(result.images[0].id);

      expect(result.images).toHaveLength(1);
      expect(result.chapters[0].text.split(marker)).toHaveLength(3);
    });

    it('drops an image missing from the archive without failing', () => {
      mockEpub(
        [
          {
            blocks: [
              paragraph(text('Before')),
              paragraph(image('gone.png', 'Lost')),
              paragraph(text('After')),
            ],
          },
        ],
        {},
      );

      const result = parser.parse(new Uint8Array([1]));

      expect(result.images).toEqual([]);
      expect(result.chapters[0].text).toBe('Before\n\nAfter');
    });

    it.each([
      ['larger than 10 MiB', 'big.png', new Uint8Array(10 * 1024 * 1024 + 1)],
      ['of an unsupported type', 'scan.bmp', PNG],
    ])('skips an image %s', (_label, src, bytes) => {
      mockEpub([{ blocks: [paragraph(text('Text'), image(src, 'Alt'))] }], {
        [src]: bytes,
      });

      const result = parser.parse(new Uint8Array([1]));

      expect(result.images).toEqual([]);
      expect(findImageMarkerIds(result.chapters[0].text)).toEqual([]);
      expect(result.chapters[0].text).toBe('Text');
    });

    it('drops a chapter that holds only an image and does not keep its image', () => {
      mockEpub(
        [
          { blocks: [paragraph(image('plate.png', 'Plate'))] },
          { blocks: [paragraph(text('Readable'))], text: 'Readable' },
        ],
        { 'plate.png': PNG },
      );

      const result = parser.parse(new Uint8Array([1]));

      expect(result.chapters.map((chapter) => chapter.text)).toEqual([
        'Readable',
      ]);
      expect(result.images).toEqual([]);
    });

    it('counts words without markers', () => {
      mockEpub(
        [
          {
            blocks: [
              paragraph(text('Before '), image('a.png'), text(' after')),
            ],
          },
        ],
        { 'a.png': PNG },
      );

      expect(parser.parse(new Uint8Array([1])).chapters[0].wordCount).toBe(2);
    });

    it('keeps the library text for a chapter without images', () => {
      mockEpub(
        [{ text: 'Library text', blocks: [paragraph(text('Block text'))] }],
        {},
      );

      expect(parser.parse(new Uint8Array([1])).chapters[0].text).toBe(
        'Library text',
      );
    });

    it('places a figure image before its caption', () => {
      mockEpub(
        [
          {
            blocks: [
              {
                kind: 'figure',
                figure: {
                  images: [image('fig.png', 'Fig')],
                  caption: [text('Caption')],
                },
              },
            ],
          },
        ],
        { 'fig.png': PNG },
      );

      const result = parser.parse(new Uint8Array([1]));

      expect(result.chapters[0].text).toBe(
        `${formatImageMarker(result.images[0].id)}\n\nCaption`,
      );
    });
  });
});

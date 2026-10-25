import { parse } from '@abfcode/spine';
import { EpubParserService } from './epub-parser.service.js';

describe('EpubParserService', () => {
  const parser = new EpubParserService();
  const parseMock = jest.mocked(parse);

  beforeEach(() => {
    parseMock.mockReset();
  });

  it('returns normalized, ordered readable chapters and book metadata', () => {
    parseMock.mockReturnValue({
      metadata: {
        title: '  A Book  ',
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
      authors: ['Author One', 'Author Two'],
      cover: {
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: 'image/jpeg',
      },
      chapters: [
        {
          position: 0,
          title: 'Second chapter',
          sourceHref: 'text/second.xhtml',
          text: 'Second\n\nchapter',
          wordCount: 2,
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
});

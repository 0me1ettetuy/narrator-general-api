import { randomUUID } from 'node:crypto';
import { contentTypeFromHref } from '@abfcode/spine';
import type { Block, Book, Inline, Table } from '@abfcode/spine';
import {
  findImageMarkerIds,
  formatImageMarker,
} from './chapter-image-marker.js';
import type { ParsedEpubImage } from './types/parsed-epub.type.js';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_BOOK_IMAGES = 300;
export const MAX_BOOK_IMAGE_BYTES = 100 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
]);

/**
 * Swaps image inlines for `[[img_<id>]]` markers and collects the images
 * once per book, so a repeated logo is one stored file with one id.
 */
export class EpubImageCollector {
  // A null entry is an image already judged unusable, so it is read only once.
  private readonly bySource = new Map<string, ParsedEpubImage | null>();
  private totalBytes = 0;

  constructor(private readonly book: Book) {}

  hasImages(blocks: Block[]): boolean {
    return blocks.some(
      (block) =>
        block.inlines?.some(isImage) ||
        block.figure?.images.length ||
        block.table?.rows.some((row) =>
          row.cells.some((cell) => cell.inlines.some(isImage)),
        ),
    );
  }

  replaceImages(blocks: Block[]): Block[] {
    return blocks.flatMap((block) => this.replaceInBlock(block));
  }

  // Only images whose marker survived (their chapter was kept) are returned.
  usedImages(texts: string[]): ParsedEpubImage[] {
    const usedIds = new Set(texts.flatMap(findImageMarkerIds));

    return [...this.bySource.values()].filter(
      (image): image is ParsedEpubImage =>
        image !== null && usedIds.has(image.id),
    );
  }

  private replaceInBlock(block: Block): Block[] {
    if (block.figure) {
      const markers = this.toInlines(block.figure.images);
      const blocks: Block[] = [];

      if (markers.length) {
        blocks.push({ kind: 'paragraph', inlines: markers });
      }
      if (block.figure.caption.length) {
        blocks.push({ kind: 'paragraph', inlines: block.figure.caption });
      }

      return blocks;
    }

    return [
      {
        ...block,
        ...(block.inlines && { inlines: this.toInlines(block.inlines) }),
        ...(block.table && { table: this.replaceInTable(block.table) }),
      },
    ];
  }

  private replaceInTable(table: Table): Table {
    return {
      rows: table.rows.map((row) => ({
        cells: row.cells.map((cell) => ({
          ...cell,
          inlines: this.toInlines(cell.inlines),
          ...(cell.tables && {
            tables: cell.tables.map((nested) => this.replaceInTable(nested)),
          }),
        })),
      })),
    };
  }

  private toInlines(inlines: Inline[]): Inline[] {
    return inlines.map((inline) => {
      if (!isImage(inline)) {
        return inline;
      }

      const image = this.collect(inline);

      // Spaces keep the marker apart from neighbouring words; normalizeText trims them.
      return {
        kind: 'text',
        text: image ? ` ${formatImageMarker(image.id)} ` : '',
      };
    });
  }

  private collect(inline: Inline): ParsedEpubImage | null {
    const src = inline.src;

    if (!src) {
      return null;
    }
    if (this.bySource.has(src)) {
      return this.bySource.get(src) ?? null;
    }

    const image = this.read(src, inline.alt);
    this.bySource.set(src, image);

    return image;
  }

  private read(src: string, alt: string | undefined): ParsedEpubImage | null {
    const mimeType = contentTypeFromHref(src);
    let bytes: Uint8Array | undefined;

    try {
      bytes = this.book.openResource(src);
    } catch {
      return null;
    }

    if (
      !bytes ||
      !IMAGE_MIME_TYPES.has(mimeType) ||
      bytes.byteLength > MAX_IMAGE_BYTES ||
      this.countStored() >= MAX_BOOK_IMAGES ||
      this.totalBytes + bytes.byteLength > MAX_BOOK_IMAGE_BYTES
    ) {
      return null;
    }

    this.totalBytes += bytes.byteLength;

    return { id: randomUUID(), bytes, mimeType, alt: alt?.trim() || null };
  }

  private countStored(): number {
    let count = 0;

    for (const image of this.bySource.values()) {
      if (image) {
        count += 1;
      }
    }

    return count;
  }
}

function isImage(inline: Inline): boolean {
  return inline.kind === 'image';
}

export const parse = jest.fn();

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
};

export function contentTypeFromHref(href: string): string {
  return CONTENT_TYPES[href.split('.').pop()?.toLowerCase() ?? ''] ?? '';
}

type MockInline = { kind: string; text?: string; alt?: string };

// Stand-in for the library's blocksToText: one paragraph per block, inlines
// joined as-is, images as their alt text or "[image]" like the real default.
export function blocksToText(blocks: { inlines?: MockInline[] }[]): string {
  return blocks
    .map((block) =>
      (block.inlines ?? [])
        .map((inline) =>
          inline.kind === 'image' ? inline.alt || '[image]' : inline.text,
        )
        .join(''),
    )
    .join('\n\n');
}

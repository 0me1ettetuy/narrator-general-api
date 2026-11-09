const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const MARKER_SOURCE = `\\[\\[img_(${UUID})\\]\\]`;
const SPACE = '[^\\S\\n]';

export function formatImageMarker(imageId: string): string {
  return `[[img_${imageId}]]`;
}

export function findImageMarkerIds(text: string): string[] {
  const ids = [...text.matchAll(new RegExp(MARKER_SOURCE, 'giu'))].map(
    (match) => match[1].toLowerCase(),
  );

  return [...new Set(ids)];
}

// A marker between two spaces leaves one space; one beside a newline leaves the newline.
export function stripImageMarkers(text: string): string {
  return text
    .replace(
      new RegExp(`(${SPACE}?)${MARKER_SOURCE}(${SPACE}?)`, 'giu'),
      (_match, before: string, _id: string, after: string) =>
        before && after ? ' ' : before + after,
    )
    .trim();
}

export function countNarratedWords(text: string): number {
  return stripImageMarkers(text).split(/\s+/u).length;
}

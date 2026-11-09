import {
  countNarratedWords,
  findImageMarkerIds,
  formatImageMarker,
  stripImageMarkers,
} from './chapter-image-marker.js';

const A = '0b9c1f52-3a4e-4d6a-9b1e-2f7c8d9e0a11';
const B = '7d2e4a90-1c3b-4f58-8a6d-5e9f0b1c2d33';

describe('chapter image markers', () => {
  it('formats a marker around the image id', () => {
    expect(formatImageMarker(A)).toBe(`[[img_${A}]]`);
  });

  it('finds unique ids in order of first appearance', () => {
    expect(
      findImageMarkerIds(`a [[img_${A}]] b\n\n[[img_${B}]] [[img_${A}]]`),
    ).toEqual([A, B]);
  });

  it('ignores text that only looks like a marker', () => {
    expect(
      findImageMarkerIds(`[[img_not-a-uuid]] [[image_${A}]] [img_${A}]`),
    ).toEqual([]);
  });

  it('removes an inline marker without leaving a double space', () => {
    expect(stripImageMarkers(`He said [[img_${A}]] stop.`)).toBe(
      'He said stop.',
    );
  });

  it('leaves a blank paragraph where a block marker stood', () => {
    expect(stripImageMarkers(`one\n\n[[img_${A}]]\n\ntwo`)).toBe(
      'one\n\n\n\ntwo',
    );
  });

  it('counts words without counting markers', () => {
    expect(countNarratedWords(`Before [[img_${A}]] after`)).toBe(2);
    expect(countNarratedWords(`one two\n\n[[img_${B}]]\n\nthree`)).toBe(3);
  });
});

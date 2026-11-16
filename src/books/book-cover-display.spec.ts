import sharp from 'sharp';
import { makePng } from '../test-mocks/png.js';
import {
  getCoverDisplayObjectKey,
  resizeCoverForDisplay,
} from './book-cover-display.js';

describe('book cover display copy', () => {
  it('shrinks a wide cover to 800 px and keeps the proportions', async () => {
    const display = await resizeCoverForDisplay(await makePng(1600, 2400));
    const metadata = await sharp(display!).metadata();

    expect(metadata).toMatchObject({
      format: 'webp',
      width: 800,
      height: 1200,
    });
  });

  it('never upscales a small cover', async () => {
    const display = await resizeCoverForDisplay(await makePng(300, 450));

    expect(await sharp(display!).metadata()).toMatchObject({
      width: 300,
      height: 450,
    });
  });

  it('returns null for bytes that are not an image', async () => {
    await expect(
      resizeCoverForDisplay(new Uint8Array([1, 2, 3])),
    ).resolves.toBeNull();
  });

  it('uses a fixed key beside the original', () => {
    expect(getCoverDisplayObjectKey('u', 'b')).toBe(
      'books/u/b/cover/display.webp',
    );
  });
});

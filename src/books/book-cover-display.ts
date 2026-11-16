import sharp from 'sharp';
import type { StorageService } from '../storage/storage.service.js';

export const COVER_DISPLAY_MAX_WIDTH = 800;
export const COVER_DISPLAY_MIME_TYPE = 'image/webp';
const COVER_DISPLAY_QUALITY = 85;

export function getCoverDisplayObjectKey(
  userId: string,
  bookId: string,
): string {
  return `books/${userId}/${bookId}/cover/display.webp`;
}

/** Returns the resized copy, or null when the bytes are not a decodable image. */
export async function resizeCoverForDisplay(
  bytes: Uint8Array,
): Promise<Uint8Array | null> {
  try {
    return await sharp(bytes)
      .rotate()
      .resize({ width: COVER_DISPLAY_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: COVER_DISPLAY_QUALITY })
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * Stores the display copy at its fixed key and returns that key, or null when
 * the cover cannot be resized (readers then fall back to the original).
 */
export async function storeCoverDisplay(
  storageService: StorageService,
  userId: string,
  bookId: string,
  originalBytes: Uint8Array,
): Promise<string | null> {
  const display = await resizeCoverForDisplay(originalBytes);

  if (!display) {
    return null;
  }

  const objectKey = getCoverDisplayObjectKey(userId, bookId);
  await storageService.putObjectBytes(
    objectKey,
    display,
    COVER_DISPLAY_MIME_TYPE,
  );

  return objectKey;
}

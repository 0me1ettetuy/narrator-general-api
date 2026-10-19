import type { StorageService } from '../storage/storage.service.js';

jest.mock('../storage/storage.service.js', () => ({
  StorageService: class StorageService {},
}));

import { AudioMergeService } from './audio-merge.service.js';

describe('AudioMergeService', () => {
  const storageService = {
    getObjectStream: jest.fn(),
  };
  const service = new AudioMergeService(
    storageService as unknown as StorageService,
  );

  beforeEach(() => {
    storageService.getObjectStream.mockReset();
  });

  it('rejects an empty part list before touching R2 or FFmpeg', async () => {
    await expect(service.merge([])).rejects.toThrow(
      'No audio parts are available to merge',
    );

    expect(storageService.getObjectStream).not.toHaveBeenCalled();
  });

  it('rejects duplicate part positions before touching R2 or FFmpeg', async () => {
    await expect(
      service.merge([
        { position: 0, objectKey: 'first.mp3' },
        { position: 0, objectKey: 'second.mp3' },
      ]),
    ).rejects.toThrow('Audio parts are invalid for merging');

    expect(storageService.getObjectStream).not.toHaveBeenCalled();
  });
});

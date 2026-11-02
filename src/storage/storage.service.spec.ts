import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import type { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service.js';

describe('StorageService', () => {
  const config: Record<string, string> = {
    STORAGE_PROVIDER: 'minio',
    STORAGE_BUCKET: 'narrator',
    STORAGE_REGION: 'auto',
    STORAGE_ACCESS_KEY_ID: 'access-key',
    STORAGE_SECRET_ACCESS_KEY: 'secret-key',
    STORAGE_ENDPOINT: 'http://localhost:9000',
  };
  const configService = {
    get: jest.fn((key: string) => config[key]),
  } as unknown as ConfigService;
  let send: jest.SpyInstance;

  beforeEach(() => {
    send = jest.spyOn(S3Client.prototype, 'send');
  });

  afterEach(() => {
    send.mockRestore();
  });

  it('deletes every object under a prefix across listing pages', async () => {
    send.mockImplementation((command: unknown) => {
      if (command instanceof ListObjectsV2Command) {
        return Promise.resolve(
          command.input.ContinuationToken
            ? { Contents: [{ Key: 'books/u/b/audio/c/a.mp3' }] }
            : {
                Contents: [
                  { Key: 'books/u/b/source/original.epub' },
                  { Key: 'books/u/b/cover/original.png' },
                ],
                IsTruncated: true,
                NextContinuationToken: 'next-page',
              },
        );
      }

      return Promise.resolve({});
    });
    const service = new StorageService(configService);

    await service.deleteObjectsByPrefix('books/u/b/');

    const commands = send.mock.calls.map(([command]) => command as object);
    const listCommands = commands.filter(
      (command): command is ListObjectsV2Command =>
        command instanceof ListObjectsV2Command,
    );
    const deletedKeys = commands
      .filter(
        (command): command is DeleteObjectsCommand =>
          command instanceof DeleteObjectsCommand,
      )
      .flatMap((command) =>
        (command.input.Delete?.Objects ?? []).map((object) => object.Key),
      );

    expect(listCommands.map((command) => command.input)).toEqual([
      {
        Bucket: 'narrator',
        Prefix: 'books/u/b/',
        ContinuationToken: undefined,
      },
      {
        Bucket: 'narrator',
        Prefix: 'books/u/b/',
        ContinuationToken: 'next-page',
      },
    ]);
    expect(deletedKeys).toEqual([
      'books/u/b/source/original.epub',
      'books/u/b/cover/original.png',
      'books/u/b/audio/c/a.mp3',
    ]);
  });

  it('succeeds without deleting anything when the prefix is already empty', async () => {
    send.mockResolvedValue({});
    const service = new StorageService(configService);

    await service.deleteObjectsByPrefix('books/u/b/');

    expect(
      send.mock.calls.some(
        ([command]) => command instanceof DeleteObjectsCommand,
      ),
    ).toBe(false);
  });

  it.each(['', '/', 'books/u/b'])(
    'refuses an unsafe prefix %p instead of deleting outside one folder',
    async (prefix) => {
      const service = new StorageService(configService);

      await expect(service.deleteObjectsByPrefix(prefix)).rejects.toThrow(
        'Storage prefix must be a non-empty folder path ending with /',
      );
      expect(send).not.toHaveBeenCalled();
    },
  );
});

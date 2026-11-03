import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';

export const SIGNED_URL_TTL_SECONDS = 15 * 60;
const MULTIPART_UPLOAD_PART_SIZE_BYTES = 5 * 1024 * 1024;
const STORAGE_PROVIDERS = ['r2', 's3', 'minio'] as const;

type StorageProvider = (typeof STORAGE_PROVIDERS)[number];

type CreateDownloadUrlOptions = {
  asAttachment?: boolean;
};

export type StorageObjectMetadata = {
  contentLength: number | undefined;
  contentType: string | undefined;
  eTag: string | undefined;
};

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly signedUrlClient: S3Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    const provider = this.getStorageProvider();
    this.bucket = this.getRequiredConfig('STORAGE_BUCKET');
    const clientOptions = {
      region: this.getRequiredConfig('STORAGE_REGION'),
      forcePathStyle: provider === 'minio',
      credentials: {
        accessKeyId: this.getRequiredConfig('STORAGE_ACCESS_KEY_ID'),
        secretAccessKey: this.getRequiredConfig('STORAGE_SECRET_ACCESS_KEY'),
      },
    };

    this.client = new S3Client({
      ...clientOptions,
      endpoint: this.getInternalEndpoint(provider),
    });
    this.signedUrlClient = new S3Client({
      ...clientOptions,
      endpoint: this.getPublicEndpoint(provider),
    });
  }

  createUploadUrl(objectKey: string, contentType: string): Promise<string> {
    return getSignedUrl(
      this.signedUrlClient,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        ContentType: contentType,
      }),
      { expiresIn: SIGNED_URL_TTL_SECONDS },
    );
  }

  createDownloadUrl(
    objectKey: string,
    options: CreateDownloadUrlOptions = {},
  ): Promise<string> {
    return getSignedUrl(
      this.signedUrlClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        ResponseContentDisposition: options.asAttachment
          ? 'attachment'
          : undefined,
      }),
      { expiresIn: SIGNED_URL_TTL_SECONDS },
    );
  }

  async putObjectBytes(
    objectKey: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: bytes,
        ContentType: contentType,
      }),
    );
  }

  async putObjectStream(
    objectKey: string,
    stream: Readable,
    contentType: string,
  ): Promise<void> {
    await new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: objectKey,
        Body: stream,
        ContentType: contentType,
      },
      queueSize: 1,
      partSize: MULTIPART_UPLOAD_PART_SIZE_BYTES,
    }).done();
  }

  async copyObject(
    sourceObjectKey: string,
    targetObjectKey: string,
  ): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceObjectKey}`,
        Key: targetObjectKey,
      }),
    );
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }),
    );
  }

  async deleteObjects(objectKeys: string[]): Promise<void> {
    const uniqueObjectKeys = [...new Set(objectKeys.filter(Boolean))];

    for (let index = 0; index < uniqueObjectKeys.length; index += 1_000) {
      const response = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: uniqueObjectKeys
              .slice(index, index + 1_000)
              .map((Key) => ({ Key })),
          },
        }),
      );

      if (response.Errors?.length) {
        throw new Error('One or more storage objects could not be deleted');
      }
    }
  }

  async deleteObjectsByPrefix(prefix: string): Promise<void> {
    if (!/^[^/]+(\/[^/]+)*\/$/.test(prefix)) {
      throw new Error(
        'Storage prefix must be a non-empty folder path ending with /',
      );
    }

    let continuationToken: string | undefined;

    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const objectKeys = (page.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => Boolean(key));

      if (objectKeys.length) {
        await this.deleteObjects(objectKeys);
      }

      continuationToken = page.IsTruncated
        ? page.NextContinuationToken
        : undefined;
    } while (continuationToken);
  }

  async getObjectMetadata(
    objectKey: string,
  ): Promise<StorageObjectMetadata | null> {
    try {
      const object = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
        }),
      );

      return {
        contentLength: object.ContentLength,
        contentType: object.ContentType,
        eTag: object.ETag,
      };
    } catch (error) {
      if (
        error instanceof S3ServiceException &&
        error.$metadata.httpStatusCode === 404
      ) {
        return null;
      }

      throw error;
    }
  }

  async getObjectBytes(
    objectKey: string,
    maxBytes: number,
  ): Promise<Uint8Array> {
    const object = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }),
    );

    if (!object.Body) {
      throw new Error('Object body is missing');
    }

    if (object.ContentLength !== undefined && object.ContentLength > maxBytes) {
      throw new Error('Object exceeds the allowed size');
    }

    const bytes = await object.Body.transformToByteArray();

    if (bytes.byteLength > maxBytes) {
      throw new Error('Object exceeds the allowed size');
    }

    return bytes;
  }

  async getObjectStream(objectKey: string): Promise<Readable> {
    const object = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }),
    );

    if (!object.Body || !(object.Body instanceof Readable)) {
      throw new Error('Object body is missing or is not a readable stream');
    }

    return object.Body;
  }

  private getRequiredConfig(key: string): string {
    const value = this.configService.get<string>(key);

    if (!value) {
      throw new Error(`${key} is required`);
    }

    return value;
  }

  private getStorageProvider(): StorageProvider {
    const value = this.getRequiredConfig('STORAGE_PROVIDER');

    if (STORAGE_PROVIDERS.includes(value as StorageProvider)) {
      return value as StorageProvider;
    }

    throw new Error(
      `STORAGE_PROVIDER must be one of: ${STORAGE_PROVIDERS.join(', ')}`,
    );
  }

  private getPublicEndpoint(provider: StorageProvider): string | undefined {
    const endpoint = this.configService.get<string>('STORAGE_ENDPOINT');

    if (endpoint) {
      return endpoint;
    }

    if (provider === 's3') {
      return undefined;
    }

    throw new Error('STORAGE_ENDPOINT is required for R2 and MinIO');
  }

  private getInternalEndpoint(provider: StorageProvider): string | undefined {
    return (
      this.configService.get<string>('STORAGE_INTERNAL_ENDPOINT') ||
      this.getPublicEndpoint(provider)
    );
  }
}

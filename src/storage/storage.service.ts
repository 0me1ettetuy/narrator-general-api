import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';

const DEFAULT_SIGNED_URL_TTL_SECONDS = 15 * 60;

export type StorageObjectMetadata = {
  contentLength: number | undefined;
  contentType: string | undefined;
  eTag: string | undefined;
};

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.getRequiredConfig('R2_BUCKET');
    this.client = new S3Client({
      region: this.getRequiredConfig('R2_REGION'),
      endpoint: this.getRequiredConfig('R2_ENDPOINT'),
      credentials: {
        accessKeyId: this.getRequiredConfig('R2_ACCESS_KEY_ID'),
        secretAccessKey: this.getRequiredConfig('R2_SECRET_ACCESS_KEY'),
      },
    });
  }

  createUploadUrl(objectKey: string, contentType: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        ContentType: contentType,
      }),
      { expiresIn: DEFAULT_SIGNED_URL_TTL_SECONDS },
    );
  }

  createDownloadUrl(objectKey: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }),
      { expiresIn: DEFAULT_SIGNED_URL_TTL_SECONDS },
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
}

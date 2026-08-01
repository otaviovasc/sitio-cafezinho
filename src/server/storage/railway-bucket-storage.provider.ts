import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { fileExtensions, type FileStorageProvider, type UploadInput } from './file-storage.js';

type S3ClientPort = Pick<S3Client, 'send'>;

export type RailwayBucketStorageConfig = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
};

export class RailwayBucketStorageProvider implements FileStorageProvider {
  readonly kind = 'RAILWAY_BUCKET' as const;
  private readonly client: S3ClientPort;

  constructor(private readonly config: RailwayBucketStorageConfig, client?: S3ClientPort) {
    this.client = client ?? new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async upload(input: UploadInput) {
    const fileId = `${randomUUID()}${fileExtensions[input.mimeType] ?? ''}`;
    await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: fileId,
      Body: input.buffer,
      ContentType: input.mimeType,
      ContentLength: input.buffer.byteLength,
    }));
    return { fileId };
  }

  async open(fileId: string) {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: fileId,
    })) as GetObjectCommandOutput;
    if (!response.Body) throw new Error('O Railway Bucket não retornou o conteúdo do arquivo.');
    return response.Body as NodeJS.ReadableStream;
  }

  async delete(fileId: string) {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.config.bucket,
      Key: fileId,
    }));
  }
}

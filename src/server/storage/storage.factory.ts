import { env } from '../env.js';
import type { FileStorageProvider } from './file-storage.js';
import { LocalFileStorageProvider } from './local-file-storage.provider.js';
import { RailwayBucketStorageProvider } from './railway-bucket-storage.provider.js';

let provider: FileStorageProvider | undefined;

export function getStorage() {
  if (!provider) {
    const config = env();
    provider = config.STORAGE_MODE === 'local'
      ? new LocalFileStorageProvider(config.LOCAL_STORAGE_PATH)
      : new RailwayBucketStorageProvider({
        endpoint: config.AWS_ENDPOINT_URL,
        accessKeyId: config.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
        bucket: config.AWS_S3_BUCKET_NAME,
        region: config.AWS_DEFAULT_REGION,
      });
  }
  return provider;
}

export function resetStorageForTests() { provider = undefined; }

import { env } from '../env.js';
import type { FileStorageProvider } from './file-storage.js';
import { GoogleDriveStorageProvider } from './google-drive-storage.provider.js';
import { LocalFileStorageProvider } from './local-file-storage.provider.js';

let provider: FileStorageProvider | undefined;

export function getStorage() {
  if (!provider) {
    const config = env();
    provider = config.STORAGE_MODE === 'local'
      ? new LocalFileStorageProvider(config.LOCAL_STORAGE_PATH)
      : new GoogleDriveStorageProvider(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, config.GOOGLE_REFRESH_TOKEN, config.GOOGLE_DRIVE_FOLDER_ID);
  }
  return provider;
}

export function resetStorageForTests() { provider = undefined; }

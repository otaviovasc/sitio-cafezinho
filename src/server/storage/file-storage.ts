export const MAX_FILE_SIZE = 15 * 1024 * 1024;
export const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

export type UploadInput = { buffer: Buffer; filename: string; mimeType: string };
export type StoredFile = { fileId: string; folderId: string | null };

export interface FileStorageProvider {
  readonly kind: 'LOCAL' | 'GOOGLE_DRIVE';
  upload(input: UploadInput): Promise<StoredFile>;
  open(fileId: string): Promise<NodeJS.ReadableStream>;
  delete(fileId: string): Promise<void>;
}

export const fileExtensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

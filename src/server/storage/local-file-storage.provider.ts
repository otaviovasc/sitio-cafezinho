import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileExtensions, type FileStorageProvider, type UploadInput } from './file-storage.js';

export class LocalFileStorageProvider implements FileStorageProvider {
  readonly kind = 'LOCAL' as const;
  constructor(private readonly root: string) {}

  private resolve(fileId: string) {
    if (!/^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/.test(fileId)) throw new Error('Identificador de arquivo inválido.');
    const resolved = path.resolve(this.root, fileId);
    const root = path.resolve(this.root);
    if (path.dirname(resolved) !== root) throw new Error('Caminho de arquivo inválido.');
    return resolved;
  }

  async upload(input: UploadInput) {
    await mkdir(this.root, { recursive: true });
    const fileId = `${randomUUID()}${fileExtensions[input.mimeType]}`;
    await writeFile(this.resolve(fileId), input.buffer, { flag: 'wx' });
    return { fileId, folderId: null };
  }

  async open(fileId: string) { return createReadStream(this.resolve(fileId)); }
  async delete(fileId: string) { await rm(this.resolve(fileId), { force: true }); }
  async readForTests(fileId: string) { return readFile(this.resolve(fileId)); }
}

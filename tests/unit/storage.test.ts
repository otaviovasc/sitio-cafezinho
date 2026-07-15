import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalFileStorageProvider } from '../../src/server/storage/local-file-storage.provider';

let directory = '';
afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); directory = ''; });

describe('armazenamento local', () => {
  it('grava, abre e exclui com nome aleatório', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'sitio-storage-'));
    const storage = new LocalFileStorageProvider(directory);
    const saved = await storage.upload({ buffer: Buffer.from('documento'), filename: '../../nota.pdf', mimeType: 'application/pdf' });
    expect(saved.fileId).toMatch(/^[a-f0-9-]{36}\.pdf$/);
    expect((await storage.readForTests(saved.fileId)).toString()).toBe('documento');
    await storage.delete(saved.fileId);
    await expect(storage.readForTests(saved.fileId)).rejects.toThrow();
  });

  it('bloqueia path traversal', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'sitio-storage-'));
    const storage = new LocalFileStorageProvider(directory);
    await expect(storage.open('../segredo.pdf')).rejects.toThrow('inválido');
  });
});

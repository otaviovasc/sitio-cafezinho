import { Readable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalFileStorageProvider } from '../../src/server/storage/local-file-storage.provider';
import { RailwayBucketStorageProvider } from '../../src/server/storage/railway-bucket-storage.provider';

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

const bucketConfig = {
  endpoint: 'https://storage.railway.app',
  accessKeyId: 'test-access-key',
  secretAccessKey: 'test-secret-key',
  bucket: 'sitio-documentos-test',
  region: 'auto',
};

describe('Railway Bucket', () => {
  it('grava com chave aleatória e metadados do arquivo', async () => {
    const send = vi.fn().mockResolvedValue({});
    const storage = new RailwayBucketStorageProvider(bucketConfig, { send });

    const saved = await storage.upload({
      buffer: Buffer.from('documento'),
      filename: '../../nota.pdf',
      mimeType: 'application/pdf',
    });

    expect(saved.fileId).toMatch(/^[a-f0-9-]{36}\.pdf$/);
    expect(send).toHaveBeenCalledOnce();
    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: bucketConfig.bucket,
      Key: saved.fileId,
      ContentType: 'application/pdf',
      ContentLength: 9,
    });
  });

  it('abre e exclui pelo identificador do objeto', async () => {
    const body = Readable.from(Buffer.from('documento'));
    const send = vi.fn()
      .mockResolvedValueOnce({ Body: body })
      .mockResolvedValueOnce({});
    const storage = new RailwayBucketStorageProvider(bucketConfig, { send });

    await expect(storage.open('arquivo.pdf')).resolves.toBe(body);
    await storage.delete('arquivo.pdf');

    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetObjectCommand);
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(DeleteObjectCommand);
  });

  it('falha quando o bucket não devolve conteúdo', async () => {
    const storage = new RailwayBucketStorageProvider(bucketConfig, {
      send: vi.fn().mockResolvedValue({}),
    });

    await expect(storage.open('ausente.pdf')).rejects.toThrow('não retornou o conteúdo');
  });
});

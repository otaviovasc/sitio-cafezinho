import { Readable } from 'node:stream';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../../db/client.js';
import { attachments } from '../../db/schema.js';
import { sha256 as hashFile } from '../../domain/files.js';
import { fail } from '../http/api-error.js';
import { optionalText, readJson, validate } from '../http/validation.js';
import { ALLOWED_MIME, MAX_FILE_SIZE } from '../storage/file-storage.js';
import { getStorage } from '../storage/storage.factory.js';

const documentTypeSchema = z.enum(['INVOICE', 'BOLETO', 'PAYMENT_RECEIPT', 'MILK_NOTEBOOK', 'OTHER']);

export const attachmentRoutes = new Hono()
  .get('/attachments', async (c) => c.json(await getDb().select().from(attachments).where(isNull(attachments.deletedAt)).orderBy(desc(attachments.createdAt))))
  .post('/attachments', async (c) => {
    const form = await c.req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return fail('Selecione um arquivo.');
    if (!ALLOWED_MIME.has(file.type)) return fail('Envie JPEG, PNG, WebP ou PDF.');
    if (file.size > MAX_FILE_SIZE) return fail('O arquivo deve ter no máximo 15 MB.', 413, 'FILE_TOO_LARGE');
    const purchaseId = String(form.get('purchaseId') || '') || null;
    const milkSessionId = String(form.get('milkSessionId') || '') || null;
    if (purchaseId && milkSessionId) return fail('Um documento não pode estar ligado a compra e produção ao mesmo tempo.');
    const documentType = validate(documentTypeSchema, String(form.get('documentType') || 'OTHER'));
    const notes = String(form.get('notes') || '') || null;
    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = hashFile(buffer);
    const [duplicate] = await getDb().select({ id: attachments.id }).from(attachments).where(and(eq(attachments.sha256, sha256), isNull(attachments.deletedAt), eq(attachments.storageStatus, 'AVAILABLE'))).limit(1);
    if (duplicate) return fail('Este arquivo já foi enviado.', 409, 'DUPLICATE_FILE');

    const storage = getStorage();
    let stored;
    try {
      stored = await storage.upload({ buffer, filename: file.name, mimeType: file.type });
    } catch {
      return fail('Não foi possível armazenar o arquivo. Verifique a configuração e tente novamente.', 503, 'STORAGE_FAILED');
    }
    try {
      const [created] = await getDb().insert(attachments).values({
        originalFilename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        sha256,
        storageProvider: storage.kind,
        storageFileId: stored.fileId,
        storageFolderId: stored.folderId,
        storageStatus: 'AVAILABLE',
        documentType,
        purchaseId,
        milkSessionId,
        notes,
      }).returning();
      return c.json(created, 201);
    } catch (error) {
      await storage.delete(stored.fileId).catch(() => undefined);
      throw error;
    }
  })
  .get('/attachments/:id/file', async (c) => {
    const [document] = await getDb().select().from(attachments).where(and(eq(attachments.id, c.req.param('id')), isNull(attachments.deletedAt))).limit(1);
    if (!document) return fail('Documento não encontrado.', 404, 'NOT_FOUND');
    let stream;
    try {
      stream = await getStorage().open(document.storageFileId);
    } catch {
      return fail('O arquivo não está disponível no armazenamento.', 503, 'STORAGE_UNAVAILABLE');
    }
    return new Response(Readable.toWeb(stream as Readable) as ReadableStream, {
      headers: {
        'content-type': document.mimeType,
        'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(document.originalFilename)}`,
      },
    });
  })
  .patch('/attachments/:id', async (c) => {
    const body = validate(z.object({
      documentType: documentTypeSchema.optional(),
      notes: optionalText,
    }).refine((value) => Object.keys(value).length > 0, 'Informe ao menos uma alteração.'), await readJson(c));
    const [updated] = await getDb().update(attachments).set(body).where(eq(attachments.id, c.req.param('id'))).returning();
    if (!updated) return fail('Documento não encontrado.', 404, 'NOT_FOUND');
    return c.json(updated);
  })
  .delete('/attachments/:id', async (c) => {
    const [document] = await getDb().select().from(attachments).where(and(eq(attachments.id, c.req.param('id')), isNull(attachments.deletedAt))).limit(1);
    if (!document) return fail('Documento não encontrado.', 404, 'NOT_FOUND');
    try {
      await getStorage().delete(document.storageFileId);
    } catch {
      return fail('Não foi possível excluir o arquivo do armazenamento.', 503, 'STORAGE_FAILED');
    }
    await getDb().update(attachments).set({ deletedAt: new Date(), storageStatus: 'DELETED' }).where(eq(attachments.id, document.id));
    return c.json({ deleted: true });
  });

import { Buffer } from 'node:buffer';
import { and, asc, desc, eq, inArray, notInArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../../db/client.js';
import {
  animalAliases,
  animals,
  attachments,
  captureDocuments,
  captures,
  feedItems,
  herdGroups,
  proposedActions,
  suppliers,
} from '../../db/schema.js';
import { sha256 as hashFile } from '../../domain/files.js';
import { requireDocumentQuantityReview, resolveIntent, type ResolveContext } from '../../domain/nl/resolve.js';
import { ApiError, fail } from '../http/api-error.js';
import { readJson, validate } from '../http/validation.js';
import { commitProposedAction } from '../services/commit-registry.js';
import {
  getLlmProvider,
  LlmInterpretationError,
  LlmRequestError,
  type InterpretResult,
} from '../services/llm.js';
import { ALLOWED_MIME, MAX_FILE_SIZE } from '../storage/file-storage.js';
import { getStorage } from '../storage/storage.factory.js';

const ALLOWED_AUDIO_MIME = new Set([
  'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/x-m4a', 'audio/m4a',
]);
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_DOCUMENTS = 10;
const DOCUMENT_CONCURRENCY = 3;
export const MAX_CAPTURE_MULTIPART_BYTES = 50 * 1024 * 1024;

export function buildDocumentOcrContext(userContext: string, ordinal: number, total: number): string {
  const context = userContext.trim()
    ? `Contexto geral informado pelo usuário:\n${userContext.trim()}\n\n`
    : '';
  return `Esta é a Foto ${ordinal} de ${total}.\n\n${context}Leia o cabeçalho visível desta foto e a lista de animais. Se data, lote ou período visível divergir do contexto geral, transcreva as duas evidências e não esconda a divergência.`;
}

type CaptureWarning = {
  code: 'OCR_FAILED' | 'STORAGE_FAILED' | 'AUDIO_FAILED' | 'INTERPRETATION_FAILED';
  message: string;
  documentOrdinal?: number;
};

export function interpretationFallbackForReview(error: unknown): InterpretResult | null {
  if (!(error instanceof ApiError) || !['INTERPRET_INVALID', 'LLM_FAILED'].includes(error.code)) return null;
  return {
    intents: [{
      type: 'unknown',
      reason: 'A leitura automática não pôde ser organizada. Confira as fotos e faça o registro manualmente.',
    }],
    raw: error instanceof LlmInterpretationError ? error.raw : null,
    model: error instanceof LlmInterpretationError
      ? error.model
      : error instanceof LlmRequestError
        ? error.diagnostics.model
        : 'unavailable',
    tokensUsed: error instanceof LlmInterpretationError ? error.tokensUsed : null,
  };
}

type CaptureDocumentBase = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  ordinal: number;
};

type ProcessedCaptureDocument = CaptureDocumentBase & {
  sha256: string;
  ocrText: string | null;
  ocrRaw: unknown;
  ocrModel: string | null;
  ocrStatus: 'AVAILABLE' | 'FAILED';
};

type CaptureBase = {
  inputKind: 'AUDIO' | 'DOCUMENT' | 'TEXT';
  transcript: string;
  sttRaw?: unknown;
  ocrSummary?: string | null;
  sttModel?: string | null;
  documents?: ProcessedCaptureDocument[];
  ocrWarnings?: CaptureWarning[];
};

type PreparedStorage = {
  stored: { fileId: string } | null;
  storageProvider: 'LOCAL' | 'RAILWAY_BUCKET' | null;
  storageStatus: 'AVAILABLE' | 'FAILED';
  storageWarning: string | null;
};

export function captureMultipartSizeIssue(
  audioBytes: number,
  documentBytes: number[],
): { code: 'CAPTURE_TOO_LARGE'; message: string } | null {
  const totalBytes = audioBytes + documentBytes.reduce((total, size) => total + size, 0);
  if (totalBytes <= MAX_CAPTURE_MULTIPART_BYTES) return null;
  return {
    code: 'CAPTURE_TOO_LARGE',
    message: 'O conjunto de áudio e imagens deve ter no máximo 50 MB. Reduza ou divida o envio.',
  };
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const run = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, run));
  return results;
}

async function loadResolveContext(): Promise<ResolveContext> {
  const db = getDb();
  const [groups, animalRows, aliasRows, supplierRows, feedItemRows] = await Promise.all([
    db.select({ id: herdGroups.id, name: herdGroups.name, milkingRoutine: herdGroups.milkingRoutine, active: herdGroups.active }).from(herdGroups).where(eq(herdGroups.active, true)),
    db.select({ id: animals.id, name: animals.name, tagNumber: animals.tagNumber }).from(animals),
    db.select({ animalId: animalAliases.animalId, normalizedAlias: animalAliases.normalizedAlias }).from(animalAliases),
    db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers),
    db.select({ id: feedItems.id, name: feedItems.name, canonicalUnit: feedItems.canonicalUnit, active: feedItems.active }).from(feedItems),
  ]);
  return { groups, animals: animalRows, aliases: aliasRows, suppliers: supplierRows, feedItems: feedItemRows };
}

export async function prepareDocumentStorage(
  documents: ProcessedCaptureDocument[],
  storageFactory: typeof getStorage = getStorage,
): Promise<{ prepared: PreparedStorage[]; warnings: CaptureWarning[] }> {
  if (!documents.length) return { prepared: [], warnings: [] };
  let storage: ReturnType<typeof getStorage>;
  try {
    storage = storageFactory();
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'storage indisponível';
    console.warn(JSON.stringify({ level: 'warn', event: 'capture_storage_init_failed', detail }));
    const message = 'O original não foi armazenado; a leitura continua disponível para revisão.';
    return {
      prepared: documents.map(() => ({
        stored: null,
        storageProvider: null,
        storageStatus: 'FAILED',
        storageWarning: message,
      })),
      warnings: documents.map((document) => ({ code: 'STORAGE_FAILED', message, documentOrdinal: document.ordinal })),
    };
  }

  const warnings: CaptureWarning[] = [];
  const prepared = await mapWithConcurrency(documents, DOCUMENT_CONCURRENCY, async (document) => {
    try {
      const stored = await storage.upload({
        buffer: document.buffer,
        filename: document.filename,
        mimeType: document.mimeType,
      });
      return {
        stored,
        storageProvider: storage.kind,
        storageStatus: 'AVAILABLE' as const,
        storageWarning: null,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'falha desconhecida';
      console.warn(JSON.stringify({
        level: 'warn',
        event: 'capture_document_storage_failed',
        documentOrdinal: document.ordinal,
        detail,
      }));
      const message = `O original da foto ${document.ordinal} não foi armazenado; a leitura continua disponível para revisão.`;
      warnings.push({ code: 'STORAGE_FAILED', message, documentOrdinal: document.ordinal });
      return {
        stored: null,
        storageProvider: storage.kind,
        storageStatus: 'FAILED' as const,
        storageWarning: message,
      };
    }
  });
  return { prepared, warnings };
}

async function persistCapture(base: CaptureBase, interpretation: InterpretResult, ctx: ResolveContext, latencyMs: number) {
  const documentCount = base.documents?.length ?? 0;
  const resolved = interpretation.intents.map((rawIntent) => {
    const intent = rawIntent.type === 'individual_milk_session'
      && documentCount === 1
      && !rawIntent.sourceDocumentOrdinals?.length
      ? { ...rawIntent, sourceDocumentOrdinals: [1] }
      : rawIntent;
    let action = resolveIntent(intent, ctx);
    if (intent.type === 'individual_milk_session' && documentCount > 1) {
      const ordinals = intent.sourceDocumentOrdinals ?? [];
      const invalidSource = ordinals.some((ordinal) => ordinal > documentCount);
      if (!ordinals.length || invalidSource) {
        action = {
          ...action,
          issues: [
            ...action.issues,
            !ordinals.length
              ? 'Informe quais fotos originaram este controle.'
              : 'Uma foto de origem informada não pertence a esta captura; confira a ordem das fotos.',
          ],
          commitStatus: 'NEEDS_REVIEW',
        };
      }
    }
    return base.inputKind === 'DOCUMENT' ? requireDocumentQuantityReview(action) : action;
  });
  const documents = base.documents ?? [];
  const storageResult = await prepareDocumentStorage(documents);
  try {
    const persisted = await getDb().transaction(async (tx) => {
      const attachmentIds: Array<string | null> = [];
      for (const [index, document] of documents.entries()) {
        const storage = storageResult.prepared[index];
        let attachmentId: string | null = null;
        if (storage.stored && storage.storageProvider) {
          const [attachment] = await tx.insert(attachments).values({
            originalFilename: document.filename,
            mimeType: document.mimeType,
            sizeBytes: document.sizeBytes,
            sha256: document.sha256,
            storageProvider: storage.storageProvider,
            storageFileId: storage.stored.fileId,
            storageStatus: 'AVAILABLE',
            documentType: 'MILK_NOTEBOOK',
          }).returning({ id: attachments.id });
          attachmentId = attachment.id;
        }
        attachmentIds.push(attachmentId);
      }
      const [capture] = await tx.insert(captures).values({
        inputKind: base.inputKind,
        status: 'NEEDS_REVIEW',
        transcript: base.transcript,
        sttRaw: base.sttRaw ?? null,
        ocrSummary: base.ocrSummary ?? null,
        interpretRaw: interpretation.raw ?? null,
        sttModel: base.sttModel ?? null,
        interpretModel: interpretation.model,
        tokensUsed: interpretation.tokensUsed,
        latencyMs,
        // Compatibilidade com clientes antigos: aponta para o primeiro original
        // disponível; a fonte completa passa a ser capture_documents.
        documentAttachmentId: attachmentIds.find((id): id is string => Boolean(id)) ?? null,
      }).returning();
      const persistedDocuments = documents.length
        ? await tx.insert(captureDocuments).values(documents.map((document, index) => ({
          captureId: capture.id,
          ordinal: document.ordinal,
          originalFilename: document.filename,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          sha256: document.sha256,
          ocrText: document.ocrText,
          ocrRaw: document.ocrRaw,
          ocrModel: document.ocrModel,
          ocrStatus: document.ocrStatus,
          attachmentId: attachmentIds[index],
          storageStatus: storageResult.prepared[index].storageStatus,
          storageWarning: storageResult.prepared[index].storageWarning,
        }))).returning()
        : [];
      const actions = resolved.length
        ? await tx.insert(proposedActions).values(resolved.map((action) => ({
          captureId: capture.id,
          actionType: action.actionType,
          rawIntent: action.rawIntent,
          resolvedPayload: action.resolvedPayload,
          issues: action.issues,
          commitStatus: action.commitStatus,
          status: 'NEEDS_REVIEW' as const,
        }))).returning()
        : [];
      return { capture, documents: persistedDocuments, actions };
    });
    return { ...persisted, warnings: storageResult.warnings };
  } catch (error) {
    let storage: ReturnType<typeof getStorage> | null = null;
    try { storage = getStorage(); } catch { /* a inicialização já foi avisada */ }
    if (storage) {
      await Promise.all(storageResult.prepared
        .filter((item) => item.stored)
        .map((item) => storage.delete(item.stored!.fileId).catch(() => undefined)));
    }
    throw error;
  }
}

export async function refreshCaptureStatus(captureId: string) {
  const remaining = await getDb().select({ id: proposedActions.id }).from(proposedActions)
    .where(and(eq(proposedActions.captureId, captureId), eq(proposedActions.status, 'NEEDS_REVIEW'))).limit(1);
  await getDb().update(captures)
    .set({ status: remaining.length ? 'NEEDS_REVIEW' : 'REVIEWED', updatedAt: new Date() })
    .where(eq(captures.id, captureId));
}

export const captureRoutes = new Hono()
  .post('/captures', async (c) => {
    const provider = getLlmProvider();
    const ctx = await loadResolveContext();
    const contentType = c.req.header('content-type') ?? '';
    let base: CaptureBase;

    if (contentType.includes('application/json')) {
      const body = validate(z.object({ text: z.string().trim().min(1).max(5000) }), await readJson(c));
      base = { inputKind: 'TEXT', transcript: body.text };
    } else {
      const form = await c.req.formData();
      const audio = form.get('audio');
      const pluralDocuments = form.getAll('documents').filter((item): item is File => item instanceof File);
      const legacyDocuments = pluralDocuments.length
        ? []
        : form.getAll('document').filter((item): item is File => item instanceof File);
      const documentFiles = pluralDocuments.length ? pluralDocuments : legacyDocuments;
      if (documentFiles.length > MAX_DOCUMENTS) {
        return fail(`Envie no máximo ${MAX_DOCUMENTS} imagens por vez.`, 400, 'TOO_MANY_DOCUMENTS');
      }
      for (const document of documentFiles) {
        if (!ALLOWED_MIME.has(document.type)) return fail(`O arquivo “${document.name}” não é JPEG, PNG, WebP ou PDF.`);
        if (document.size > MAX_FILE_SIZE) return fail(`O arquivo “${document.name}” deve ter no máximo 15 MB.`, 413, 'FILE_TOO_LARGE');
      }
      const multipartSizeIssue = captureMultipartSizeIssue(
        audio instanceof File ? audio.size : 0,
        documentFiles.map((document) => document.size),
      );
      if (multipartSizeIssue) return fail(multipartSizeIssue.message, 413, multipartSizeIssue.code);

      let audioTranscript: string | null = null;
      let sttRaw: unknown;
      let sttModel: string | null = null;
      const multipartWarnings: CaptureWarning[] = [];
      if (audio instanceof File) {
        // O MediaRecorder marca o tipo com parâmetro de codec (ex.: "audio/webm;codecs=opus"
        // no Chrome, "audio/mp4;codecs=..." no iOS). Comparamos só o tipo base.
        const audioType = (audio.type || 'audio/webm').split(';')[0].trim().toLowerCase();
        if (!ALLOWED_AUDIO_MIME.has(audioType)) return fail(`Formato de áudio não suportado (${audio.type || 'desconhecido'}).`, 400, 'UNSUPPORTED_AUDIO');
        if (audio.size > MAX_AUDIO_BYTES) return fail('O áudio deve ter no máximo 20 MB.', 413, 'AUDIO_TOO_LARGE');
        const rawDuration = form.get('durationSeconds');
        const durationSeconds = typeof rawDuration === 'string' ? Number(rawDuration) : undefined;
        const hasValidDuration = typeof durationSeconds === 'number'
          && Number.isFinite(durationSeconds)
          && durationSeconds > 0
          && durationSeconds <= 65;
        const buffer = Buffer.from(await audio.arrayBuffer());
        try {
          const result = await provider.transcribe({
            buffer,
            filename: audio.name || 'audio.webm',
            mimeType: audioType,
            ...(hasValidDuration ? { durationSeconds } : {}),
          });
          audioTranscript = result.text;
          sttRaw = result.raw;
          sttModel = result.model;
        } catch (error) {
          if (!documentFiles.length) throw error;
          console.warn(JSON.stringify({
            level: 'warn',
            event: 'capture_audio_transcription_failed',
            code: error instanceof ApiError ? error.code : 'UNKNOWN',
          }));
          multipartWarnings.push({
            code: 'AUDIO_FAILED',
            message: 'Não foi possível transcrever o áudio de contexto; as fotos continuam em processamento.',
          });
        }
      }

      if (documentFiles.length) {
        const rawContext = form.get('context');
        const writtenContext = typeof rawContext === 'string' ? rawContext.trim() : '';
        const userContext = [writtenContext, audioTranscript].filter(Boolean).join('\n');
        const inputDocuments: CaptureDocumentBase[] = await Promise.all(documentFiles.map(async (document, index) => ({
          buffer: Buffer.from(await document.arrayBuffer()),
          filename: document.name || `documento-${index + 1}`,
          mimeType: document.type || 'application/octet-stream',
          sizeBytes: document.size,
          ordinal: index + 1,
        })));
        const ocrWarnings: CaptureWarning[] = [];
        const documents = await mapWithConcurrency(inputDocuments, DOCUMENT_CONCURRENCY, async (document) => {
          try {
            const result = await provider.ocr({
              buffer: document.buffer,
              filename: document.filename,
              mimeType: document.mimeType,
            }, buildDocumentOcrContext(userContext, document.ordinal, inputDocuments.length));
            return {
              ...document,
              sha256: hashFile(document.buffer),
              ocrText: result.text,
              ocrRaw: result.raw,
              ocrModel: result.model,
              ocrStatus: 'AVAILABLE' as const,
            };
          } catch (error) {
            console.warn(JSON.stringify({
              level: 'warn',
              event: 'capture_document_ocr_failed',
              documentOrdinal: document.ordinal,
              code: error instanceof ApiError ? error.code : 'UNKNOWN',
            }));
            ocrWarnings.push({
              code: 'OCR_FAILED',
              message: `Não foi possível ler a foto ${document.ordinal}; as demais continuam disponíveis.`,
              documentOrdinal: document.ordinal,
            });
            return {
              ...document,
              sha256: hashFile(document.buffer),
              ocrText: null,
              ocrRaw: null,
              ocrModel: null,
              ocrStatus: 'FAILED' as const,
            };
          }
        });
        const transcriptParts = [
          userContext ? `Contexto do usuário:\n${userContext}` : '',
          ...documents.map((document) => [
            `[Documento ${document.ordinal}: ${document.filename}]`,
            document.ocrText ?? '[Leitura indisponível; revisar a foto original.]',
          ].join('\n')),
        ].filter(Boolean);
        base = {
          inputKind: 'DOCUMENT',
          transcript: transcriptParts.join('\n\n'),
          ocrSummary: documents.map((document) => document.ocrText).filter(Boolean).join('\n\n'),
          sttRaw,
          sttModel,
          documents,
        };
        base.ocrWarnings = [...multipartWarnings, ...ocrWarnings];
      } else if (audioTranscript !== null) {
        base = { inputKind: 'AUDIO', transcript: audioTranscript, sttRaw, sttModel };
      } else {
        return fail('Envie um áudio, um documento ou um texto.', 400, 'NO_INPUT');
      }
    }

    if (!base.transcript.trim()) return fail('Não consegui entender o conteúdo. Tente de novo.', 422, 'EMPTY_TRANSCRIPT');

    const startedAt = Date.now();
    let interpretation: InterpretResult;
    try {
      interpretation = await provider.interpret(base.transcript, {
        lotNames: ctx.groups.map((group) => group.name),
        feedItemNames: ctx.feedItems.filter((item) => item.active).map((item) => item.name),
      });
    } catch (error) {
      const fallback = base.inputKind === 'DOCUMENT' ? interpretationFallbackForReview(error) : null;
      if (!fallback) throw error;
      const interpretationError = error instanceof LlmInterpretationError ? error : null;
      const requestError = error instanceof LlmRequestError ? error : null;
      console.warn(JSON.stringify({
        level: 'warn',
        event: 'capture_interpretation_failed',
        requestId: c.res.headers.get('x-request-id'),
        code: error instanceof ApiError ? error.code : 'UNKNOWN',
        inputKind: base.inputKind,
        documentCount: base.documents?.length ?? 0,
        transcriptLength: base.transcript.length,
        model: interpretationError?.model ?? requestError?.diagnostics.model ?? null,
        attempts: interpretationError?.diagnostics.attempts ?? [],
        providerFailure: requestError?.diagnostics ?? null,
      }));
      interpretation = fallback;
      base.ocrWarnings = [
        ...(base.ocrWarnings ?? []),
        {
          code: 'INTERPRETATION_FAILED',
          message: 'As fotos e suas leituras foram preservadas, mas não consegui organizar os registros. Revise a pendência ou registre manualmente.',
        },
      ];
    }
    const { capture, documents, actions, warnings } = await persistCapture(base, interpretation, ctx, Date.now() - startedAt);
    const ocrWarnings = base.ocrWarnings ?? [];
    return c.json({
      captureId: capture.id,
      transcript: capture.transcript,
      status: capture.status,
      documents,
      actions,
      warnings: [...ocrWarnings, ...warnings],
    }, 201);
  })
  .get('/captures', async (c) => {
    // Só pendências reais: capturas com todas as ações resolvidas (REVIEWED)
    // ou descartadas saem da fila de revisão.
    const rows = await getDb().select().from(captures).where(notInArray(captures.status, ['DISMISSED', 'REVIEWED'])).orderBy(desc(captures.createdAt)).limit(200);
    const ids = rows.map((row) => row.id);
    const [actions, documents] = ids.length
      ? await Promise.all([
        getDb().select().from(proposedActions).where(inArray(proposedActions.captureId, ids)).orderBy(asc(proposedActions.createdAt)),
        getDb().select().from(captureDocuments).where(inArray(captureDocuments.captureId, ids)).orderBy(asc(captureDocuments.ordinal)),
      ])
      : [[], []];
    const byCapture = new Map<string, typeof actions>();
    for (const action of actions) {
      const list = byCapture.get(action.captureId) ?? [];
      list.push(action);
      byCapture.set(action.captureId, list);
    }
    const documentsByCapture = new Map<string, typeof documents>();
    for (const document of documents) {
      const list = documentsByCapture.get(document.captureId) ?? [];
      list.push(document);
      documentsByCapture.set(document.captureId, list);
    }
    return c.json(rows.map((row) => ({
      ...row,
      documents: documentsByCapture.get(row.id) ?? [],
      actions: byCapture.get(row.id) ?? [],
    })));
  })
  .get('/captures/:id', async (c) => {
    const [capture] = await getDb().select().from(captures).where(eq(captures.id, c.req.param('id'))).limit(1);
    if (!capture) return fail('Captura não encontrada.', 404, 'NOT_FOUND');
    const [actions, documents] = await Promise.all([
      getDb().select().from(proposedActions).where(eq(proposedActions.captureId, capture.id)).orderBy(asc(proposedActions.createdAt)),
      getDb().select().from(captureDocuments).where(eq(captureDocuments.captureId, capture.id)).orderBy(asc(captureDocuments.ordinal)),
    ]);
    return c.json({ ...capture, documents, actions });
  })
  .post('/captures/:captureId/actions/:actionId/commit', async (c) => {
    const { captureId, actionId } = c.req.param();
    const override = await c.req.json().then((body: unknown) => (body as { payload?: Record<string, unknown> } | null)?.payload).catch(() => undefined);
    const [action] = await getDb().select().from(proposedActions)
      .where(and(eq(proposedActions.id, actionId), eq(proposedActions.captureId, captureId))).limit(1);
    if (!action) return fail('Ação não encontrada.', 404, 'NOT_FOUND');
    if (action.status === 'CONFIRMED') return fail('Esta ação já foi confirmada.', 409, 'ALREADY_CONFIRMED');
    const payload = (override ?? action.resolvedPayload ?? {}) as Record<string, unknown>;
    const result = await commitProposedAction(action.actionType, payload);
    const [updated] = await getDb().update(proposedActions).set({
      status: 'CONFIRMED',
      resolvedPayload: payload,
      committedRecordType: result.recordType,
      committedRecordId: result.recordId,
      updatedAt: new Date(),
    }).where(eq(proposedActions.id, actionId)).returning();
    await refreshCaptureStatus(captureId);
    return c.json({ committed: result, action: updated });
  })
  .post('/captures/:captureId/actions/:actionId/dismiss', async (c) => {
    const { captureId, actionId } = c.req.param();
    const [updated] = await getDb().update(proposedActions).set({ status: 'DISMISSED', updatedAt: new Date() })
      .where(and(eq(proposedActions.id, actionId), eq(proposedActions.captureId, captureId))).returning();
    if (!updated) return fail('Ação não encontrada.', 404, 'NOT_FOUND');
    await refreshCaptureStatus(captureId);
    return c.json({ dismissed: true, action: updated });
  });

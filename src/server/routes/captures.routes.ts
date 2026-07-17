import { Buffer } from 'node:buffer';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../../db/client.js';
import { animalAliases, animals, captures, herdGroups, proposedActions, suppliers } from '../../db/schema.js';
import { resolveIntent, type ResolveContext } from '../../domain/nl/resolve.js';
import { fail } from '../http/api-error.js';
import { readJson, validate } from '../http/validation.js';
import { commitProposedAction } from '../services/commit-registry.js';
import { getLlmProvider, type InterpretResult } from '../services/llm.js';

const ALLOWED_AUDIO_MIME = new Set([
  'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/x-m4a', 'audio/m4a',
]);
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

type CaptureBase = {
  inputKind: 'AUDIO' | 'DOCUMENT' | 'TEXT';
  transcript: string;
  sttRaw?: unknown;
  ocrSummary?: string | null;
  sttModel?: string | null;
};

async function loadResolveContext(): Promise<ResolveContext> {
  const db = getDb();
  const [groups, animalRows, aliasRows, supplierRows] = await Promise.all([
    db.select({ id: herdGroups.id, name: herdGroups.name, milkingRoutine: herdGroups.milkingRoutine, active: herdGroups.active }).from(herdGroups).where(eq(herdGroups.active, true)),
    db.select({ id: animals.id, name: animals.name, tagNumber: animals.tagNumber }).from(animals),
    db.select({ animalId: animalAliases.animalId, normalizedAlias: animalAliases.normalizedAlias }).from(animalAliases),
    db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers),
  ]);
  return { groups, animals: animalRows, aliases: aliasRows, suppliers: supplierRows };
}

async function persistCapture(base: CaptureBase, interpretation: InterpretResult, ctx: ResolveContext, latencyMs: number) {
  const resolved = interpretation.intents.map((intent) => resolveIntent(intent, ctx));
  return getDb().transaction(async (tx) => {
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
    }).returning();
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
    return { capture, actions };
  });
}

async function refreshCaptureStatus(captureId: string) {
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
      const document = form.get('document');
      if (audio instanceof File) {
        // O MediaRecorder marca o tipo com parâmetro de codec (ex.: "audio/webm;codecs=opus"
        // no Chrome, "audio/mp4;codecs=..." no iOS). Comparamos só o tipo base.
        const audioType = (audio.type || 'audio/webm').split(';')[0].trim().toLowerCase();
        if (!ALLOWED_AUDIO_MIME.has(audioType)) return fail(`Formato de áudio não suportado (${audio.type || 'desconhecido'}).`, 400, 'UNSUPPORTED_AUDIO');
        if (audio.size > MAX_AUDIO_BYTES) return fail('O áudio deve ter no máximo 20 MB.', 413, 'AUDIO_TOO_LARGE');
        const buffer = Buffer.from(await audio.arrayBuffer());
        const result = await provider.transcribe({ buffer, filename: audio.name || 'audio.webm', mimeType: audioType });
        base = { inputKind: 'AUDIO', transcript: result.text, sttRaw: result.raw, sttModel: result.model };
      } else if (document instanceof File) {
        const hint = typeof form.get('context') === 'string' ? String(form.get('context')) : undefined;
        const buffer = Buffer.from(await document.arrayBuffer());
        const result = await provider.ocr({ buffer, filename: document.name || 'documento', mimeType: document.type || 'application/octet-stream' }, hint);
        base = { inputKind: 'DOCUMENT', transcript: result.text, ocrSummary: result.text };
      } else {
        return fail('Envie um áudio, um documento ou um texto.', 400, 'NO_INPUT');
      }
    }

    if (!base.transcript.trim()) return fail('Não consegui entender o conteúdo. Tente de novo.', 422, 'EMPTY_TRANSCRIPT');

    const startedAt = Date.now();
    const interpretation = await provider.interpret(base.transcript, { lotNames: ctx.groups.map((group) => group.name) });
    const { capture, actions } = await persistCapture(base, interpretation, ctx, Date.now() - startedAt);
    return c.json({ captureId: capture.id, transcript: capture.transcript, status: capture.status, actions }, 201);
  })
  .get('/captures', async (c) => {
    const rows = await getDb().select().from(captures).where(ne(captures.status, 'DISMISSED')).orderBy(desc(captures.createdAt)).limit(200);
    const ids = rows.map((row) => row.id);
    const actions = ids.length
      ? await getDb().select().from(proposedActions).where(inArray(proposedActions.captureId, ids)).orderBy(asc(proposedActions.createdAt))
      : [];
    const byCapture = new Map<string, typeof actions>();
    for (const action of actions) {
      const list = byCapture.get(action.captureId) ?? [];
      list.push(action);
      byCapture.set(action.captureId, list);
    }
    return c.json(rows.map((row) => ({ ...row, actions: byCapture.get(row.id) ?? [] })));
  })
  .get('/captures/:id', async (c) => {
    const [capture] = await getDb().select().from(captures).where(eq(captures.id, c.req.param('id'))).limit(1);
    if (!capture) return fail('Captura não encontrada.', 404, 'NOT_FOUND');
    const actions = await getDb().select().from(proposedActions).where(eq(proposedActions.captureId, capture.id)).orderBy(asc(proposedActions.createdAt));
    return c.json({ ...capture, actions });
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

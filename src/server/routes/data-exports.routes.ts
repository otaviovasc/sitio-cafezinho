import { asc } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../../db/client.js';
import { animalAliases, animalStatusEvents, animalWeights, animals, mastitisActions, mastitisCases, milkCollections, milkMeasurements, milkSessions, purchases, revenues, suppliers, weightSessions, dailyMilkTotals, herdGroups } from '../../db/schema.js';
import { fail } from '../http/api-error.js';

type CsvRow = Record<string, string | number | boolean | Date | null | undefined>;

function safeCell(value: CsvRow[string]) {
  if (value === null || value === undefined) return '';
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const guarded = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replaceAll('"', '""')}"`;
}

function csv(rows: CsvRow[]) {
  if (!rows.length) return '\ufeff';
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return `\ufeff${headers.map(safeCell).join(',')}\n${rows.map((row) => headers.map((header) => safeCell(row[header])).join(',')).join('\n')}\n`;
}

function response(rows: CsvRow[], filename: string) {
  return new Response(csv(rows), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${filename}"` } });
}

export const dataExportRoutes = new Hono().get('/data-exports/:dataset.csv', async (c) => {
  const dataset = c.req.param('dataset');
  const db = getDb();
  if (dataset === 'animals') {
    const [animalRows, aliases, statusRows] = await Promise.all([
      db.select().from(animals).orderBy(asc(animals.name), asc(animals.tagNumber)),
      db.select().from(animalAliases).orderBy(asc(animalAliases.createdAt)),
      db.select().from(animalStatusEvents).orderBy(asc(animalStatusEvents.changedOn)),
    ]);
    return response([
      ...animalRows.map((row) => ({ recordType: 'ANIMAL', id: row.id, animalId: row.id, name: row.name, tagNumber: row.tagNumber, currentStatus: row.status, notes: row.notes, createdAt: row.createdAt, updatedAt: row.updatedAt })),
      ...aliases.map((row) => ({ recordType: 'ALIAS', id: row.id, animalId: row.animalId, alias: row.alias, normalizedAlias: row.normalizedAlias, createdAt: row.createdAt })),
      ...statusRows.map((row) => ({ recordType: 'STATUS_EVENT', id: row.id, animalId: row.animalId, previousStatus: row.previousStatus, status: row.status, changedOn: row.changedOn, notes: row.notes, createdAt: row.createdAt })),
    ], 'sitio-animais-aliases-ciclos.csv');
  }
  if (dataset === 'production') {
    const [dailyRows, groupRows, sessionRows, measurementRows] = await Promise.all([
      db.select().from(dailyMilkTotals).orderBy(asc(dailyMilkTotals.productionDate)),
      db.select().from(herdGroups),
      db.select().from(milkSessions).orderBy(asc(milkSessions.sessionDate)),
      db.select().from(milkMeasurements).orderBy(asc(milkMeasurements.createdAt)),
    ]);
    const groupById = new Map(groupRows.map((group) => [group.id, group]));
    return response([
      ...dailyRows.map((row) => ({ recordType: 'AGGREGATE_TOTAL', id: row.id, date: row.productionDate, scope: row.herdGroupId ? 'HERD_GROUP' : 'WHOLE_HERD', herdGroupId: row.herdGroupId, herdGroupName: row.herdGroupId ? groupById.get(row.herdGroupId)?.name : null, morningLiters: row.morningLiters, afternoonLiters: row.afternoonLiters, totalLiters: row.totalLiters, notes: row.notes, createdAt: row.createdAt, updatedAt: row.updatedAt })),
      ...sessionRows.map((row) => ({ recordType: 'INDIVIDUAL_SESSION', id: row.id, sessionId: row.id, date: row.sessionDate, inputMode: row.inputMode, source: row.source, title: row.title, notes: row.notes, createdAt: row.createdAt, updatedAt: row.updatedAt })),
      ...measurementRows.map((row) => ({ recordType: 'INDIVIDUAL_MEASUREMENT', id: row.id, sessionId: row.milkSessionId, animalId: row.animalId, rawAnimalLabel: row.rawAnimalLabel, rawValueText: row.rawValueText, morningLiters: row.morningLiters, afternoonLiters: row.afternoonLiters, totalLiters: row.totalLiters, confidence: row.confidence, status: row.status, notes: row.notes, createdAt: row.createdAt, updatedAt: row.updatedAt })),
    ], 'sitio-producao.csv');
  }
  if (dataset === 'collections') return response(await db.select().from(milkCollections).orderBy(asc(milkCollections.collectionDate)), 'sitio-coletas.csv');
  if (dataset === 'weights') {
    const [sessions, measurements] = await Promise.all([db.select().from(weightSessions).orderBy(asc(weightSessions.measuredOn)), db.select().from(animalWeights).orderBy(asc(animalWeights.measuredAt))]);
    return response([
      ...sessions.map((row) => ({ recordType: 'WEIGHT_SESSION', id: row.id, sessionId: row.id, measuredOn: row.measuredOn, title: row.title, source: row.source, notes: row.notes, createdAt: row.createdAt, updatedAt: row.updatedAt })),
      ...measurements.map((row) => ({ recordType: 'WEIGHT_MEASUREMENT', id: row.id, sessionId: row.weightSessionId, animalId: row.animalId, measuredAt: row.measuredAt, rawAnimalLabel: row.rawAnimalLabel, rawValueText: row.rawValueText, weightKg: row.weightKg, confidence: row.confidence, status: row.status, notes: row.notes, createdAt: row.createdAt, updatedAt: row.updatedAt })),
    ], 'sitio-pesos.csv');
  }
  if (dataset === 'mastitis') {
    const [cases, actions] = await Promise.all([db.select().from(mastitisCases).orderBy(asc(mastitisCases.detectedAt)), db.select().from(mastitisActions).orderBy(asc(mastitisActions.scheduledFor))]);
    return response([
      ...cases.map((row) => ({ recordType: 'MASTITIS_CASE', ...row })),
      ...actions.map((row) => ({ recordType: 'MASTITIS_ACTION', ...row })),
    ], 'sitio-mastite.csv');
  }
  if (dataset === 'finance') {
    const [purchaseRows, revenueRows, supplierRows] = await Promise.all([db.select().from(purchases).orderBy(asc(purchases.purchaseDate)), db.select().from(revenues).orderBy(asc(revenues.revenueDate)), db.select().from(suppliers).orderBy(asc(suppliers.name))]);
    return response([
      ...purchaseRows.map((row) => ({ recordType: 'PURCHASE', ...row })),
      ...revenueRows.map((row) => ({ recordType: 'REVENUE', ...row })),
      ...supplierRows.map((row) => ({ recordType: 'SUPPLIER', ...row })),
    ], 'sitio-compras-receitas-fornecedores.csv');
  }
  return fail('Exportação não encontrada.', 404, 'NOT_FOUND');
});

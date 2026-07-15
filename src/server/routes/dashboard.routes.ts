import { desc, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../../db/client.js';
import { animalGroupAssignments, animals, animalWeights, attachments, dailyMilkTotals, herdGroups, milkMeasurements, milkSessions, purchases, weightSessions } from '../../db/schema.js';
import { summarizeDailyMilk } from '../../domain/daily-milk.js';
import { dateKeyInSaoPaulo, isOverdue } from '../../domain/purchases.js';
import { env } from '../env.js';

export const dashboardRoutes = new Hono().get('/dashboard', async (c) => {
  const db = getDb();
  const sessions = await db.select().from(milkSessions).orderBy(desc(milkSessions.sessionDate), desc(milkSessions.createdAt));
  const latest = sessions[0];
  const allMeasurements = await db.select().from(milkMeasurements);
  const measurements = latest ? allMeasurements.filter((row) => row.milkSessionId === latest.id) : [];
  const [purchaseRows, dailyRows, documentRows, animalRows, assignments, groupRows, weights, weightSessionRows] = await Promise.all([
    db.select().from(purchases).orderBy(desc(purchases.purchaseDate)),
    db.select().from(dailyMilkTotals).orderBy(desc(dailyMilkTotals.productionDate)),
    db.select().from(attachments).where(isNull(attachments.deletedAt)),
    db.select().from(animals),
    db.select().from(animalGroupAssignments).where(isNull(animalGroupAssignments.endedOn)),
    db.select().from(herdGroups),
    db.select().from(animalWeights).orderBy(desc(animalWeights.measuredAt)),
    db.select().from(weightSessions).orderBy(desc(weightSessions.measuredOn)),
  ]);
  const confirmed = measurements.filter((row) => row.status === 'CONFIRMED');
  const confirmedTotal = confirmed.reduce((sum, row) => sum + Number(row.totalLiters), 0);
  const month = dateKeyInSaoPaulo().slice(0, 7);
  const [year, monthNumber] = month.split('-').map(Number);
  const previousMonthDate = new Date(Date.UTC(year, monthNumber - 2, 1));
  const previousMonth = previousMonthDate.toISOString().slice(0, 7);
  const monthPurchases = purchaseRows.filter((row) => row.purchaseDate.startsWith(month) && row.status !== 'CANCELLED');
  const dailyMonth = summarizeDailyMilk(dailyRows, month);
  const previousMonthPurchases = purchaseRows.filter((row) => row.purchaseDate.startsWith(previousMonth) && row.status !== 'CANCELLED');
  const open = purchaseRows.filter((row) => row.status === 'OPEN');
  const trend = sessions.slice(0, 5).map((session) => ({
    sessionId: session.id,
    sessionDate: session.sessionDate,
    total: allMeasurements.filter((row) => row.milkSessionId === session.id && row.status === 'CONFIRMED').reduce((sum, row) => sum + Number(row.totalLiters), 0),
  })).reverse();
  const categories = Object.entries(monthPurchases.reduce<Record<string, number>>((totals, row) => {
    totals[row.category] = (totals[row.category] ?? 0) + Number(row.totalAmount);
    return totals;
  }, {})).sort((a, b) => b[1] - a[1]);
  const sessionPoints = sessions.map((session) => ({
    date: session.sessionDate,
    totalLiters: allMeasurements.filter((row) => row.milkSessionId === session.id && row.status === 'CONFIRMED').reduce((sum, row) => sum + Number(row.totalLiters), 0),
    source: 'INDIVIDUAL_CONTROL' as const,
  }));
  const productionTimeline = [
    ...dailyRows.map((row) => ({ date: row.productionDate, totalLiters: Number(row.totalLiters), source: 'DAILY_TOTAL' as const })),
    ...sessionPoints,
  ].sort((a, b) => a.date.localeCompare(b.date));
  function monthProduction(monthKey: string) {
    const rows = productionTimeline.filter((row) => row.date.startsWith(monthKey));
    const total = rows.reduce((sum, row) => sum + row.totalLiters, 0);
    return { measuredDays: rows.length, total, average: rows.length ? total / rows.length : 0 };
  }
  const currentProduction = monthProduction(month);
  const previousProduction = monthProduction(previousMonth);
  const latestWeightSession = weightSessionRows[0];
  const latestWeights = latestWeightSession ? weights.filter((row) => row.weightSessionId === latestWeightSession.id && row.status === 'CONFIRMED' && row.weightKg !== null) : [];
  const lactating = animalRows.filter((animal) => animal.status === 'LACTATING');
  const assignedIds = new Set(assignments.map((assignment) => assignment.animalId));
  const groupCounts = groupRows.filter((group) => group.active).map((group) => ({ ...group, animalCount: assignments.filter((assignment) => assignment.groupId === group.id).length }));
  const openOverdue = open.filter((row) => isOverdue(row));
  const purchaseMonthKeys = [2, 1, 0].map((offset) => new Date(Date.UTC(year, monthNumber - 1 - offset, 1)).toISOString().slice(0, 7));
  return c.json({
    dailyProduction: {
      latest: dailyRows[0] ?? null,
      month: dailyMonth,
      recent: dailyRows.slice(0, 14),
      comparison: { current: currentProduction, previous: previousProduction, previousMonth },
      timeline: productionTimeline.slice(-90),
    },
    production: latest ? {
      sessionId: latest.id,
      sessionDate: latest.sessionDate,
      confirmedTotal,
      confirmedCount: confirmed.length,
      average: confirmed.length ? confirmedTotal / confirmed.length : 0,
      reviewCount: measurements.filter((row) => row.status === 'NEEDS_REVIEW').length,
      highest: [...confirmed].sort((a, b) => Number(b.totalLiters) - Number(a.totalLiters)).slice(0, 5),
      lowest: [...confirmed].sort((a, b) => Number(a.totalLiters) - Number(b.totalLiters)).slice(0, 5),
      trend,
    } : null,
    purchases: {
      monthTotal: monthPurchases.reduce((sum, row) => sum + Number(row.totalAmount), 0),
      openCount: open.length,
      overdueCount: open.filter((row) => isOverdue(row)).length,
      upcoming: open.filter((row) => row.dueDate && !isOverdue(row)).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')).slice(0, 5),
      latest: purchaseRows.slice(0, 5),
      categories,
      previousMonthTotal: previousMonthPurchases.reduce((sum, row) => sum + Number(row.totalAmount), 0),
      overdueTotal: openOverdue.reduce((sum, row) => sum + Number(row.totalAmount), 0),
      trend: purchaseMonthKeys.map((monthKey) => ({ month: monthKey, total: purchaseRows.filter((row) => row.purchaseDate.startsWith(monthKey) && row.status !== 'CANCELLED').reduce((sum, row) => sum + Number(row.totalAmount), 0) })),
    },
    herd: {
      total: animalRows.length,
      lactating: lactating.length,
      dry: animalRows.filter((animal) => animal.status === 'DRY').length,
      heifers: animalRows.filter((animal) => animal.status === 'HEIFER').length,
      withoutGroup: lactating.filter((animal) => !assignedIds.has(animal.id)).length,
      groups: groupCounts,
    },
    weights: {
      latestDate: latestWeightSession?.measuredOn ?? null,
      latestCount: latestWeights.length,
      latestAverage: latestWeights.length ? latestWeights.reduce((sum, row) => sum + Number(row.weightKg), 0) / latestWeights.length : 0,
      reviewCount: weights.filter((row) => row.status === 'NEEDS_REVIEW').length,
    },
    attention: {
      milkReview: allMeasurements.filter((row) => row.status === 'NEEDS_REVIEW').length,
      weightReview: weights.filter((row) => row.status === 'NEEDS_REVIEW').length,
      overduePurchases: openOverdue.length,
      overdueTotal: openOverdue.reduce((sum, row) => sum + Number(row.totalAmount), 0),
      lactatingWithoutGroup: lactating.filter((animal) => !assignedIds.has(animal.id)).length,
    },
    documents: {
      standalone: documentRows.filter((row) => !row.purchaseId && !row.milkSessionId).length,
      errors: documentRows.filter((row) => row.storageStatus === 'FAILED').length,
      storageMode: env().STORAGE_MODE,
    },
  });
});

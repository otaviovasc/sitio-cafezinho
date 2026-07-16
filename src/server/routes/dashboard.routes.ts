import { desc, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../../db/client.js';
import { animalGroupAssignments, animals, animalWeights, attachments, dailyMilkTotals, herdGroups, mastitisActions, mastitisCases, milkCollections, milkMeasurements, milkSessions, purchases, revenues } from '../../db/schema.js';
import { resolveDailyMilkDay, summarizeDailyMilk } from '../../domain/daily-milk.js';
import { summarizeRegisteredCash } from '../../domain/finance.js';
import { mastitisActionTiming, withdrawalState } from '../../domain/mastitis.js';
import { summarizeMilkDay } from '../../domain/milk-collection.js';
import { dateKeyInSaoPaulo, isOverdue } from '../../domain/purchases.js';
import { env } from '../env.js';

function nextDate(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export const dashboardRoutes = new Hono().get('/dashboard', async (c) => {
  const db = getDb();
  const [purchaseRows, dailyRows, collectionRows, revenueRows, documentRows, animalRows, assignments, groupRows, weights, allMeasurements, sessions, caseRows, actionRows] = await Promise.all([
    db.select().from(purchases).orderBy(desc(purchases.purchaseDate)),
    db.select().from(dailyMilkTotals).orderBy(desc(dailyMilkTotals.productionDate)),
    db.select().from(milkCollections).orderBy(desc(milkCollections.collectionDate)),
    db.select().from(revenues).orderBy(desc(revenues.revenueDate)),
    db.select().from(attachments).where(isNull(attachments.deletedAt)),
    db.select().from(animals),
    db.select().from(animalGroupAssignments).where(isNull(animalGroupAssignments.endedOn)),
    db.select().from(herdGroups),
    db.select().from(animalWeights).orderBy(desc(animalWeights.measuredAt)),
    db.select().from(milkMeasurements),
    db.select().from(milkSessions).orderBy(desc(milkSessions.sessionDate)),
    db.select().from(mastitisCases).orderBy(desc(mastitisCases.detectedAt)),
    db.select().from(mastitisActions).orderBy(mastitisActions.scheduledFor),
  ]);
  const today = dateKeyInSaoPaulo();
  const tomorrow = nextDate(today);
  const month = today.slice(0, 7);
  const todayProduction = resolveDailyMilkDay(dailyRows, today);
  const todayCollections = collectionRows.filter((row) => row.collectionDate === today);
  const todayMilk = summarizeMilkDay(todayProduction?.totalLiters ?? null, todayCollections.map((row) => row.liters));
  const openPurchases = purchaseRows.filter((row) => row.status === 'OPEN');
  const overduePurchases = openPurchases.filter((row) => isOverdue(row));
  const activeCases = caseRows.filter((row) => !['RESOLVED', 'CANCELLED'].includes(row.status));
  const actionsWithTiming = actionRows.map((action) => ({ ...action, timing: mastitisActionTiming(action, today) }));
  const actionsToday = actionsWithTiming.filter((action) => action.timing === 'TODAY');
  const overdueActions = actionsWithTiming.filter((action) => action.timing === 'OVERDUE');
  const withdrawals = activeCases.flatMap((item) => {
    const state = withdrawalState(item.withdrawalEndsAt, item.status, today);
    return state ? [{ caseId: item.id, animalId: item.animalId, withdrawalEndsAt: item.withdrawalEndsAt!, ...state }] : [];
  });
  const animalById = new Map(animalRows.map((animal) => [animal.id, animal]));
  const monthDaily = summarizeDailyMilk(dailyRows, month);
  const monthCollections = collectionRows.filter((row) => row.collectionDate.startsWith(month)).reduce((sum, row) => sum + Number(row.liters), 0);
  const monthRevenues = revenueRows.filter((row) => row.revenueDate.startsWith(month));
  const monthPurchases = purchaseRows.filter((row) => row.purchaseDate.startsWith(month));
  const cash = summarizeRegisteredCash(monthRevenues, monthPurchases);
  const lactating = animalRows.filter((animal) => animal.status === 'LACTATING');
  const assignedIds = new Set(assignments.map((assignment) => assignment.animalId));
  const groupCounts = groupRows.filter((group) => group.active).map((group) => ({ ...group, animalCount: assignments.filter((assignment) => assignment.groupId === group.id).length }));
  const lactatingIds = new Set(lactating.map((animal) => animal.id));
  const activeMilkingGroupIds = new Set(groupRows.filter((group) => group.active && group.milkingRoutine !== 'NOT_MILKED').map((group) => group.id));
  const expectedProductionGroupIds = new Set(assignments.filter((assignment) => lactatingIds.has(assignment.animalId) && activeMilkingGroupIds.has(assignment.groupId)).map((assignment) => assignment.groupId));
  const todayProductionGroupIds = new Set(dailyRows.filter((row) => row.productionDate === today && row.herdGroupId).map((row) => row.herdGroupId!));
  const productionGroupsMissing = todayProduction?.basis === 'GROUP_SUM'
    ? [...expectedProductionGroupIds].filter((groupId) => !todayProductionGroupIds.has(groupId)).length
    : 0;
  const latestSession = sessions[0];
  const latestMeasurements = latestSession ? allMeasurements.filter((row) => row.milkSessionId === latestSession.id) : [];
  return c.json({
    date: today,
    today: {
      production: todayProduction,
      collectionCount: todayCollections.length,
      milk: todayMilk,
      activeTreatmentCount: activeCases.filter((item) => item.status === 'IN_TREATMENT').length,
      activeCaseCount: activeCases.length,
      actionsToday: actionsToday.length,
      overdueActions: overdueActions.length,
      withdrawals: withdrawals.map((item) => ({ ...item, animalName: animalById.get(item.animalId)?.name, tagNumber: animalById.get(item.animalId)?.tagNumber })),
    },
    attention: {
      productionMissing: !todayProduction,
      productionGroupsMissing,
      collectionMissing: todayCollections.length === 0,
      mastitisActionsToday: actionsToday.length,
      overdueMastitisActions: overdueActions.length,
      withdrawals: withdrawals.length,
      purchasesDueTomorrow: openPurchases.filter((row) => row.dueDate === tomorrow).length,
      overduePurchases: overduePurchases.length,
      overdueTotal: overduePurchases.reduce((sum, row) => sum + Number(row.totalAmount), 0),
      milkReview: allMeasurements.filter((row) => row.status === 'NEEDS_REVIEW').length,
      weightReview: weights.filter((row) => row.status === 'NEEDS_REVIEW').length,
      standaloneDocuments: documentRows.filter((row) => !row.purchaseId && !row.milkSessionId && !row.milkCollectionId && !row.revenueId && !row.animalExitId).length,
      lactatingWithoutGroup: lactating.filter((animal) => !assignedIds.has(animal.id)).length,
    },
    month: {
      productionLiters: monthDaily.total,
      productionDays: monthDaily.measuredDays,
      collectionLiters: Math.round(monthCollections * 100) / 100,
      revenuesReceived: cash.received,
      revenuesExpected: cash.expected,
      expensesPaid: cash.paid,
      purchasesOpen: cash.open,
      cashResult: cash.cashResult,
      mastitisCases: caseRows.filter((row) => dateKeyInSaoPaulo(row.detectedAt).startsWith(month)).length,
    },
    herd: {
      total: animalRows.length,
      lactating: lactating.length,
      dry: animalRows.filter((animal) => animal.status === 'DRY').length,
      heifers: animalRows.filter((animal) => animal.status === 'HEIFER').length,
      groups: groupCounts,
    },
    latestIndividualControl: latestSession ? {
      id: latestSession.id,
      sessionDate: latestSession.sessionDate,
      confirmedTotal: latestMeasurements.filter((row) => row.status === 'CONFIRMED').reduce((sum, row) => sum + Number(row.totalLiters), 0),
      reviewCount: latestMeasurements.filter((row) => row.status === 'NEEDS_REVIEW').length,
    } : null,
    documents: { errors: documentRows.filter((row) => row.storageStatus === 'FAILED').length, storageMode: env().STORAGE_MODE },
  });
});

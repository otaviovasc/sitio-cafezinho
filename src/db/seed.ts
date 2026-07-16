import { and, eq } from 'drizzle-orm';
import { normalizeLabel } from '../domain/format.js';
import { closeDb, getDb } from './client.js';
import { confirmedSeed, excludedSeed, pendingSeed } from './seed-data.js';
import {
  animalAliases,
  animalExits,
  animalGroupAssignments,
  animalReproductiveEvents,
  animals,
  animalStatusEvents,
  animalWeights,
  dailyMilkTotals,
  herdGroups,
  milkMeasurements,
  milkCollections,
  milkSessions,
  mastitisActions,
  mastitisCases,
  purchaseItems,
  purchases,
  revenues,
  suppliers,
  weightSessions,
} from './schema.js';

const seedDate = '2026-05-06';
const seedTitle = 'Controle leiteiro — manhã + tarde';
const demoMarkerTitle = 'Controle demonstrativo — 09/04/2026';
const initialDate = '2026-04-01';
const heiferSeeds = [
  { name: 'Estrela', tagNumber: '701' },
  { name: 'Lua', tagNumber: '702' },
  { name: 'Mimosa', tagNumber: '703' },
];

const allSeedRows = [...confirmedSeed, pendingSeed, ...excludedSeed];
const labels = [...new Set(allSeedRows.map((row) => row.rawAnimalLabel))];
const baseTotalByLabel = new Map<string, number>();
for (const row of allSeedRows) if (!baseTotalByLabel.has(normalizeLabel(row.rawAnimalLabel))) baseTotalByLabel.set(normalizeLabel(row.rawAnimalLabel), row.totalLiters);

const lote2Labels = new Set(['Banana', 'Atleta', 'Caruja', 'Formosa', '503', '184'].map(normalizeLabel));
const dryIntervals = new Map<string, Array<[string, string | null]>>([
  [normalizeLabel('Chocolate'), [['2026-05-10', '2026-07-10']]],
  [normalizeLabel('Aninha'), [['2026-05-15', '2026-07-14']]],
  [normalizeLabel('Zuleide'), [['2026-06-20', null]]],
  [normalizeLabel('Maquinha'), [['2026-06-25', null]]],
  [normalizeLabel('61'), [['2026-07-01', null]]],
  [normalizeLabel('Gigi'), [['2026-07-06', null]]],
]);

function isLactatingOn(label: string, date: string) {
  return !(dryIntervals.get(normalizeLabel(label)) ?? []).some(([start, end]) => date >= start && (end === null || date < end));
}

function roundedHalf(value: number) { return Math.round(value * 2) / 2; }

async function runSeed() {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.insert(herdGroups).values([
      { name: 'Lote 1', milkingRoutine: 'MORNING_AND_AFTERNOON' },
      { name: 'Lote 2', milkingRoutine: 'MORNING_ONLY' },
    ]).onConflictDoNothing();
    const [lote1] = await tx.select().from(herdGroups).where(eq(herdGroups.name, 'Lote 1')).limit(1);
    const [lote2] = await tx.select().from(herdGroups).where(eq(herdGroups.name, 'Lote 2')).limit(1);
    if (!lote1 || !lote2) throw new Error('Não foi possível preparar os lotes iniciais.');

    if (process.env.SEED_DEMO_DATA !== 'true') {
      console.log('Estrutura inicial aplicada sem dados demonstrativos.');
      return;
    }

    const animalByLabel = new Map<string, typeof animals.$inferSelect>();
    const currentAnimals = await tx.select().from(animals);
    const currentAliases = await tx.select().from(animalAliases);
    const currentStatusEvents = await tx.select().from(animalStatusEvents);
    const currentAssignments = await tx.select().from(animalGroupAssignments);

    for (const label of labels) {
      const normalized = normalizeLabel(label);
      const numeric = /^\d+$/.test(label.trim());
      let animal = currentAnimals.find((candidate) => numeric
        ? candidate.tagNumber === label.trim()
        : candidate.name !== null && normalizeLabel(candidate.name) === normalized);
      if (!animal) {
        [animal] = await tx.insert(animals).values({ name: numeric ? null : label.trim(), tagNumber: numeric ? label.trim() : null, status: 'LACTATING' }).returning();
        currentAnimals.push(animal);
      }
      animalByLabel.set(normalized, animal);
      if (!currentAliases.some((alias) => alias.animalId === animal.id && alias.normalizedAlias === normalized)) {
        const [createdAlias] = await tx.insert(animalAliases).values({ animalId: animal.id, alias: label, normalizedAlias: normalized }).returning();
        currentAliases.push(createdAlias);
      }
      if (!currentStatusEvents.some((event) => event.animalId === animal.id)) {
        const [createdEvent] = await tx.insert(animalStatusEvents).values({ animalId: animal.id, previousStatus: null, status: 'LACTATING', changedOn: initialDate, notes: 'Situação inicial dos dados demonstrativos.' }).returning();
        currentStatusEvents.push(createdEvent);
      }
      if (!currentAssignments.some((assignment) => assignment.animalId === animal.id)) {
        const [assignment] = await tx.insert(animalGroupAssignments).values({ animalId: animal.id, groupId: lote1.id, startedOn: initialDate, notes: 'Lote inicial dos dados demonstrativos.' }).returning();
        currentAssignments.push(assignment);
      }
    }

    for (const seed of heiferSeeds) {
      const normalized = normalizeLabel(seed.name);
      let animal = currentAnimals.find((candidate) => candidate.tagNumber === seed.tagNumber || (candidate.name && normalizeLabel(candidate.name) === normalized));
      if (!animal) {
        [animal] = await tx.insert(animals).values({ name: seed.name, tagNumber: seed.tagNumber, status: 'HEIFER', notes: 'Novilha fictícia para demonstrar o acompanhamento antes da primeira lactação.' }).returning();
        currentAnimals.push(animal);
      } else if (animal.status !== 'HEIFER' && !currentStatusEvents.some((event) => event.animalId === animal!.id && event.previousStatus !== null)) {
        [animal] = await tx.update(animals).set({ status: 'HEIFER', updatedAt: new Date() }).where(eq(animals.id, animal.id)).returning();
      }
      animalByLabel.set(normalized, animal);
      if (!currentAliases.some((alias) => alias.animalId === animal.id && alias.normalizedAlias === normalized)) {
        const [createdAlias] = await tx.insert(animalAliases).values({ animalId: animal.id, alias: seed.name, normalizedAlias: normalized }).returning();
        currentAliases.push(createdAlias);
      }
      if (!currentStatusEvents.some((event) => event.animalId === animal.id)) {
        const [createdEvent] = await tx.insert(animalStatusEvents).values({ animalId: animal.id, previousStatus: null, status: 'HEIFER', changedOn: initialDate, notes: 'Novilha antes da primeira lactação — dado demonstrativo.' }).returning();
        currentStatusEvents.push(createdEvent);
      }
    }

    const reproductiveEvents = await tx.select().from(animalReproductiveEvents);
    async function addHeat(input: { label: string; occurredOn: string; hadBreeding: boolean; bullName?: string; outcome?: 'PENDING' | 'NOT_PREGNANT' | 'PREGNANT'; outcomeRecordedOn?: string; notes: string }) {
      const animal = animalByLabel.get(normalizeLabel(input.label));
      if (!animal || reproductiveEvents.some((event) => event.animalId === animal.id && event.type === 'HEAT' && event.occurredOn === input.occurredOn)) return;
      const [created] = await tx.insert(animalReproductiveEvents).values({
        animalId: animal.id,
        type: 'HEAT',
        occurredOn: input.occurredOn,
        hadBreeding: input.hadBreeding,
        bullName: input.hadBreeding ? input.bullName ?? null : null,
        outcome: input.hadBreeding ? input.outcome ?? 'PENDING' : null,
        outcomeRecordedOn: input.hadBreeding && input.outcome && input.outcome !== 'PENDING' ? input.outcomeRecordedOn ?? null : null,
        notes: input.notes,
      }).returning();
      reproductiveEvents.push(created);
    }
    async function syncCalvings() {
      for (const statusEvent of currentStatusEvents.filter((event) => event.status === 'LACTATING' && event.previousStatus && (event.previousStatus === 'DRY' || event.previousStatus === 'HEIFER'))) {
        if (reproductiveEvents.some((event) => event.statusEventId === statusEvent.id)) continue;
        const [created] = await tx.insert(animalReproductiveEvents).values({ animalId: statusEvent.animalId, statusEventId: statusEvent.id, type: 'CALVING', occurredOn: statusEvent.changedOn, notes: statusEvent.notes }).returning();
        reproductiveEvents.push(created);
      }
    }

    await addHeat({ label: 'Caruja', occurredOn: '2026-05-18', hadBreeding: true, bullName: 'Touro 18', outcome: 'NOT_PREGNANT', outcomeRecordedOn: '2026-06-10', notes: 'Primeira cobertura demonstrativa; prenhez não confirmada.' });
    await addHeat({ label: 'Caruja', occurredOn: '2026-06-12', hadBreeding: true, bullName: 'Touro 18', outcome: 'PREGNANT', outcomeRecordedOn: '2026-07-05', notes: 'Prenhez confirmada — dado demonstrativo.' });
    await addHeat({ label: 'Banana', occurredOn: '2026-06-22', hadBreeding: false, notes: 'Cio observado, sem cobertura — dado demonstrativo.' });
    await addHeat({ label: 'Banana', occurredOn: '2026-07-03', hadBreeding: true, bullName: 'Touro 18', outcome: 'PENDING', notes: 'Cobertura aguardando confirmação — dado demonstrativo.' });
    await addHeat({ label: 'Estrela', occurredOn: '2026-05-25', hadBreeding: true, bullName: 'Touro 22', outcome: 'NOT_PREGNANT', outcomeRecordedOn: '2026-06-18', notes: 'Primeira tentativa demonstrativa.' });
    await addHeat({ label: 'Estrela', occurredOn: '2026-06-20', hadBreeding: true, bullName: 'Touro 22', outcome: 'PREGNANT', outcomeRecordedOn: '2026-07-12', notes: 'Prenhez confirmada; continua novilha até o primeiro parto.' });
    await addHeat({ label: 'Lua', occurredOn: '2026-06-28', hadBreeding: false, notes: 'Cio observado sem cobertura — dado demonstrativo.' });
    await syncCalvings();

    const existingDailyRows = await tx.select().from(dailyMilkTotals);
    for (const [index, row] of existingDailyRows.entries()) {
      if (row.morningLiters !== null || row.afternoonLiters !== null || row.notes !== 'Total diário fictício para demonstração local.') continue;
      const total = Number(row.totalLiters);
      const morning = roundedHalf(total * (0.57 + (index % 3) * 0.01));
      const afternoon = total - morning;
      await tx.update(dailyMilkTotals).set({ morningLiters: morning.toFixed(2), afternoonLiters: afternoon.toFixed(2), updatedAt: new Date() }).where(eq(dailyMilkTotals.id, row.id));
    }

    const [canonical] = await tx.select({ id: milkSessions.id }).from(milkSessions).where(and(eq(milkSessions.sessionDate, seedDate), eq(milkSessions.source, 'NOTEBOOK_SEED'), eq(milkSessions.title, seedTitle))).limit(1);
    if (!canonical) {
      const [session] = await tx.insert(milkSessions).values({ sessionDate: seedDate, inputMode: 'COMBINED_TOTAL', source: 'NOTEBOOK_SEED', title: seedTitle, notes: 'Transcrição inicial do caderno. Os valores representam a soma da manhã com a tarde.' }).returning();
      await tx.insert(milkMeasurements).values([
        ...confirmedSeed.map((row) => ({ milkSessionId: session.id, animalId: animalByLabel.get(normalizeLabel(row.rawAnimalLabel))?.id, rawAnimalLabel: row.rawAnimalLabel, morningLiters: null, afternoonLiters: null, totalLiters: row.totalLiters.toFixed(2), confidence: 'HIGH' as const, status: 'CONFIRMED' as const })),
        { milkSessionId: session.id, animalId: animalByLabel.get(normalizeLabel(pendingSeed.rawAnimalLabel))?.id, rawAnimalLabel: pendingSeed.rawAnimalLabel, rawValueText: pendingSeed.rawValueText, morningLiters: null, afternoonLiters: null, totalLiters: pendingSeed.totalLiters.toFixed(2), confidence: 'LOW' as const, status: 'NEEDS_REVIEW' as const, notes: 'Valor anotado com interrogações no caderno' },
        ...excludedSeed.map((row) => ({ milkSessionId: session.id, animalId: animalByLabel.get(normalizeLabel(row.rawAnimalLabel))?.id, rawAnimalLabel: row.rawAnimalLabel, rawValueText: row.rawValueText, morningLiters: null, afternoonLiters: null, totalLiters: row.totalLiters.toFixed(2), confidence: 'MEDIUM' as const, status: 'EXCLUDED' as const, notes: 'Linha riscada no caderno' })),
      ]);
    }

    const [demoMarker] = await tx.select({ id: milkSessions.id }).from(milkSessions).where(eq(milkSessions.title, demoMarkerTitle)).limit(1);

    const [demoCollection] = await tx.select({ id: milkCollections.id }).from(milkCollections).where(eq(milkCollections.notes, 'Coleta fictícia para demonstração local.')).limit(1);
    if (!demoCollection) await tx.insert(milkCollections).values({ collectionDate: '2026-07-14', collectedAt: new Date('2026-07-14T09:10:00-03:00'), liters: '690.00', source: 'DRIVER_READING', notes: 'Coleta fictícia para demonstração local.' });

    const caruja = animalByLabel.get(normalizeLabel('Caruja'));
    if (caruja) {
      let [demoCase] = await tx.select().from(mastitisCases).where(and(eq(mastitisCases.animalId, caruja.id), eq(mastitisCases.notes, 'Caso fictício para demonstração local.'))).limit(1);
      if (!demoCase) [demoCase] = await tx.insert(mastitisCases).values({ animalId: caruja.id, detectedAt: new Date('2026-07-14T07:30:00-03:00'), affectedQuarter: 'FRONT_LEFT', detectionMethod: 'VISUAL', observedSigns: 'Grumos observados no leite — dado demonstrativo.', status: 'IN_TREATMENT', treatmentSummary: 'Tratamento informado pela família conforme orientação recebida.', treatmentStartedAt: new Date('2026-07-14T08:00:00-03:00'), withdrawalEndsAt: '2026-07-18', milkDiscardRequired: true, notes: 'Caso fictício para demonstração local.' }).returning();
      const [demoAction] = await tx.select({ id: mastitisActions.id }).from(mastitisActions).where(and(eq(mastitisActions.mastitisCaseId, demoCase.id), eq(mastitisActions.actionDescription, 'Reavaliar leite — ação demonstrativa'))).limit(1);
      if (!demoAction) await tx.insert(mastitisActions).values({ mastitisCaseId: demoCase.id, scheduledFor: new Date('2026-07-15T12:00:00-03:00'), actionDescription: 'Reavaliar leite — ação demonstrativa' });
    }

    const [demoMilkRevenue] = await tx.select({ id: revenues.id }).from(revenues).where(eq(revenues.description, 'Pagamento demonstrativo do laticínio')).limit(1);
    if (!demoMilkRevenue) await tx.insert(revenues).values({ revenueDate: '2026-07-10', category: 'MILK_SALE', description: 'Pagamento demonstrativo do laticínio', amount: '18450.00', status: 'RECEIVED', receivedAt: new Date('2026-07-10T12:00:00-03:00'), periodStart: '2026-06-16', periodEnd: '2026-06-30', quantity: '10800.000', unitPrice: '1.7083', bonusAmount: '300.00', discountAmount: '300.00', buyerName: 'Laticínio demonstrativo', notes: 'Receita fictícia para demonstração local.' });

    let [soldDemoAnimal] = await tx.select().from(animals).where(eq(animals.name, 'Bezerro fictício vendido')).limit(1);
    if (!soldDemoAnimal) [soldDemoAnimal] = await tx.insert(animals).values({ name: 'Bezerro fictício vendido', tagNumber: 'DEMO-VENDA', status: 'SOLD', notes: 'Animal exclusivamente demonstrativo.' }).returning();
    let [soldStatusEvent] = await tx.select().from(animalStatusEvents).where(and(eq(animalStatusEvents.animalId, soldDemoAnimal.id), eq(animalStatusEvents.status, 'SOLD'))).limit(1);
    if (!soldStatusEvent) [soldStatusEvent] = await tx.insert(animalStatusEvents).values({ animalId: soldDemoAnimal.id, previousStatus: 'HEIFER', status: 'SOLD', changedOn: '2026-07-05', notes: 'Venda fictícia para demonstração local.' }).returning();
    let [saleRevenue] = await tx.select().from(revenues).where(and(eq(revenues.animalId, soldDemoAnimal.id), eq(revenues.description, 'Venda demonstrativa de animal'))).limit(1);
    if (!saleRevenue) [saleRevenue] = await tx.insert(revenues).values({ revenueDate: '2026-07-05', category: 'CALF_SALE', description: 'Venda demonstrativa de animal', amount: '1850.00', status: 'RECEIVED', receivedAt: new Date('2026-07-05T12:00:00-03:00'), animalId: soldDemoAnimal.id, buyerName: 'Comprador demonstrativo', notes: 'Receita fictícia vinculada à saída.' }).returning();
    const [demoExit] = await tx.select({ id: animalExits.id }).from(animalExits).where(eq(animalExits.statusEventId, soldStatusEvent.id)).limit(1);
    if (!demoExit) await tx.insert(animalExits).values({ animalId: soldDemoAnimal.id, statusEventId: soldStatusEvent.id, exitType: 'CALF_SALE', reason: 'Venda de cria — dado demonstrativo.', buyerName: 'Comprador demonstrativo', weightKg: '185.00', amount: '1850.00', revenueId: saleRevenue.id, revenueCreatedHere: true, notes: 'Saída fictícia para demonstração local.' });

    if (demoMarker) return;

    async function closeCurrentAssignment(label: string, endedOn: string) {
      const animal = animalByLabel.get(normalizeLabel(label));
      if (!animal) return;
      const assignment = currentAssignments.find((row) => row.animalId === animal.id && row.endedOn === null);
      if (assignment) {
        await tx.update(animalGroupAssignments).set({ endedOn }).where(eq(animalGroupAssignments.id, assignment.id));
        assignment.endedOn = endedOn;
      }
    }

    for (const label of lote2Labels) {
      const animal = animalByLabel.get(label);
      if (!animal) continue;
      await closeCurrentAssignment(label, '2026-06-15');
      const [assignment] = await tx.insert(animalGroupAssignments).values({ animalId: animal.id, groupId: lote2.id, startedOn: '2026-06-15', notes: 'Movida para rotina de ordenha somente pela manhã.' }).returning();
      currentAssignments.push(assignment);
    }

    const transitions: Array<{ label: string; date: string; status: 'DRY' | 'LACTATING'; note: string }> = [
      { label: 'Chocolate', date: '2026-05-10', status: 'DRY', note: 'Início do período seco — dado demonstrativo.' },
      { label: 'Chocolate', date: '2026-07-10', status: 'LACTATING', note: 'Parto e início de nova lactação — dado demonstrativo.' },
      { label: 'Aninha', date: '2026-05-15', status: 'DRY', note: 'Início do período seco — dado demonstrativo.' },
      { label: 'Aninha', date: '2026-07-14', status: 'LACTATING', note: 'Parto e início de nova lactação — dado demonstrativo.' },
      { label: 'Zuleide', date: '2026-06-20', status: 'DRY', note: 'Início do período seco — dado demonstrativo.' },
      { label: 'Maquinha', date: '2026-06-25', status: 'DRY', note: 'Início do período seco — dado demonstrativo.' },
      { label: '61', date: '2026-07-01', status: 'DRY', note: 'Início do período seco — dado demonstrativo.' },
      { label: 'Gigi', date: '2026-07-06', status: 'DRY', note: 'Início do período seco — dado demonstrativo.' },
    ];
    for (const transition of transitions) {
      const animal = animalByLabel.get(normalizeLabel(transition.label));
      if (!animal) continue;
      if (transition.status === 'DRY') await closeCurrentAssignment(transition.label, transition.date);
      const previousStatus = transition.status === 'DRY' ? 'LACTATING' : 'DRY';
      const [createdEvent] = await tx.insert(animalStatusEvents).values({ animalId: animal.id, previousStatus, status: transition.status, changedOn: transition.date, notes: transition.note }).returning();
      currentStatusEvents.push(createdEvent);
      if (transition.status === 'LACTATING') {
        const [assignment] = await tx.insert(animalGroupAssignments).values({ animalId: animal.id, groupId: lote1.id, startedOn: transition.date, notes: 'Retorno ao Lote 1 após período seco.' }).returning();
        currentAssignments.push(assignment);
      }
    }
    await syncCalvings();
    for (const label of labels) {
      const normalized = normalizeLabel(label);
      const animal = animalByLabel.get(normalized);
      if (!animal) continue;
      const finalStatus = isLactatingOn(label, '2026-07-15') ? 'LACTATING' : 'DRY';
      await tx.update(animals).set({ status: finalStatus, updatedAt: new Date() }).where(eq(animals.id, animal.id));
    }

    const individualDates = ['2026-04-09', '2026-04-23', '2026-05-21', '2026-06-04', '2026-06-18', '2026-07-02'];
    for (const [sessionIndex, sessionDate] of individualDates.entries()) {
      const [session] = await tx.insert(milkSessions).values({ sessionDate, inputMode: 'SEPARATE_MORNING_AFTERNOON', source: 'NOTEBOOK_SEED', title: sessionIndex === 0 ? demoMarkerTitle : `Controle demonstrativo — ${sessionDate.split('-').reverse().join('/')}`, notes: 'Dados fictícios e plausíveis para demonstração local. Não representam medições reais.' }).returning();
      const factor = [0.93, 0.96, 1.01, 0.99, 0.97, 1.02][sessionIndex] ?? 1;
      const rows = labels.filter((label) => isLactatingOn(label, sessionDate)).map((label, animalIndex) => {
        const animal = animalByLabel.get(normalizeLabel(label));
        const base = baseTotalByLabel.get(normalizeLabel(label)) ?? 15;
        const fullDay = Math.max(5, base * factor + ((animalIndex % 7) - 3) * 0.12);
        const morningOnly = lote2Labels.has(normalizeLabel(label)) && sessionDate >= '2026-06-15';
        const morning = roundedHalf(fullDay * 0.58);
        const afternoon = morningOnly ? null : roundedHalf(fullDay - morning);
        const total = morningOnly ? morning : morning + (afternoon ?? 0);
        const needsReview = sessionDate === '2026-07-02' && label === '512';
        return { milkSessionId: session.id, animalId: animal?.id, rawAnimalLabel: label, rawValueText: `${morning.toFixed(1)}${afternoon === null ? '' : ` + ${afternoon.toFixed(1)}`}`, morningLiters: morning.toFixed(2), afternoonLiters: afternoon === null ? null : afternoon.toFixed(2), totalLiters: total.toFixed(2), confidence: needsReview ? 'LOW' as const : 'HIGH' as const, status: needsReview ? 'NEEDS_REVIEW' as const : 'CONFIRMED' as const, notes: needsReview ? 'Último dígito duvidoso — dado demonstrativo.' : null };
      });
      await tx.insert(milkMeasurements).values(rows);
    }

    const controlDates = new Set([...individualDates, seedDate]);
    const start = new Date('2026-04-15T12:00:00Z');
    const end = new Date('2026-07-14T12:00:00Z');
    const dailyRows: Array<{ productionDate: string; morningLiters: string; afternoonLiters: string; totalLiters: string; notes: string }> = [];
    for (let date = new Date(start), index = 0; date <= end; date.setUTCDate(date.getUTCDate() + 1), index += 1) {
      const key = date.toISOString().slice(0, 10);
      if (controlDates.has(key) || date.getUTCDay() === 0 || index % 17 === 0) continue;
      const monthBase = key < '2026-05-01' ? 786 : key < '2026-06-01' ? 772 : key < '2026-07-01' ? 742 : 716;
      const value = roundedHalf(monthBase + Math.sin(index * 0.72) * 18 + ((index % 5) - 2) * 2.5);
      const morning = roundedHalf(value * (0.57 + (index % 3) * 0.01));
      const afternoon = value - morning;
      dailyRows.push({ productionDate: key, morningLiters: morning.toFixed(2), afternoonLiters: afternoon.toFixed(2), totalLiters: value.toFixed(2), notes: 'Total diário fictício para demonstração local.' });
    }
    await tx.insert(dailyMilkTotals).values(dailyRows).onConflictDoNothing();

    const weightDates = [
      { date: '2026-04-18', count: 32 },
      { date: '2026-05-30', count: 38 },
      { date: '2026-07-08', count: 42 },
    ];
    for (const [sessionIndex, config] of weightDates.entries()) {
      const [session] = await tx.insert(weightSessions).values({ measuredOn: config.date, title: `Pesagem demonstrativa — ${config.date.split('-').reverse().join('/')}`, source: 'DEMO_SEED', notes: 'Sessão parcial com dados fictícios para demonstração local.' }).returning();
      const selected = labels.slice(0, config.count);
      if (!selected.includes('512')) selected[selected.length - 1] = '512';
      await tx.insert(animalWeights).values(selected.map((label, index) => {
        const suspicious = sessionIndex === 2 && label === '512';
        const value = 418 + ((index * 17) % 185) + sessionIndex * 5 + ((index % 3) - 1) * 1.5;
        return { animalId: animalByLabel.get(normalizeLabel(label))?.id, weightSessionId: session.id, measuredAt: new Date(`${config.date}T12:00:00-03:00`), rawAnimalLabel: label, rawValueText: suspicious ? '690?' : roundedHalf(value).toFixed(1), weightKg: (suspicious ? 690 : roundedHalf(value)).toFixed(2), confidence: suspicious ? 'LOW' as const : 'HIGH' as const, status: suspicious ? 'NEEDS_REVIEW' as const : 'CONFIRMED' as const, notes: suspicious ? 'Variação forte e leitura duvidosa — dado demonstrativo.' : null };
      }));
    }

    const supplierByName = new Map<string, string>();
    for (const name of ['Raca forte', 'Prudenmax', 'Cocamar']) {
      let [supplier] = await tx.select().from(suppliers).where(eq(suppliers.name, name)).limit(1);
      if (!supplier) [supplier] = await tx.insert(suppliers).values({ name, notes: 'Fornecedor demonstrativo.' }).returning();
      supplierByName.set(name, supplier.id);
    }
    const purchaseSeeds = [
      { supplier: 'Raca forte', date: '2026-04-05', description: 'Ração leiteira — abril', category: 'FEED' as const, amount: 7340.14, due: '2026-04-12', paid: '2026-04-11' },
      { supplier: 'Cocamar', date: '2026-04-18', description: 'Sal mineral para o rebanho', category: 'MINERAL_SUPPLEMENT' as const, amount: 1260, due: '2026-04-25', paid: '2026-04-24' },
      { supplier: 'Raca forte', date: '2026-05-05', description: 'Ração leiteira — maio', category: 'FEED' as const, amount: 7685, due: '2026-05-12', paid: '2026-05-12' },
      { supplier: 'Prudenmax', date: '2026-05-22', description: 'Medicamentos veterinários', category: 'MEDICINE' as const, amount: 842.5, due: '2026-05-29', paid: '2026-05-28' },
      { supplier: 'Raca forte', date: '2026-06-04', description: 'Ração leiteira — junho', category: 'FEED' as const, amount: 7920, due: '2026-06-11', paid: '2026-06-11' },
      { supplier: 'Prudenmax', date: '2026-06-19', description: 'Manutenção da ordenhadeira', category: 'MAINTENANCE' as const, amount: 1850, due: '2026-06-26', paid: '2026-06-25' },
      { supplier: 'Raca forte', date: '2026-07-03', description: 'Ração leiteira — julho', category: 'FEED' as const, amount: 8150, due: '2026-07-10', paid: null },
      { supplier: 'Cocamar', date: '2026-07-08', description: 'Suplemento mineral — julho', category: 'MINERAL_SUPPLEMENT' as const, amount: 1480, due: '2026-07-20', paid: null },
      { supplier: 'Prudenmax', date: '2026-07-12', description: 'Produtos de higiene da ordenha', category: 'MILKING_AND_HYGIENE' as const, amount: 690.4, due: '2026-07-25', paid: null },
    ];
    for (const row of purchaseSeeds) {
      const [purchase] = await tx.insert(purchases).values({ supplierId: supplierByName.get(row.supplier), purchaseDate: row.date, description: row.description, category: row.category, grossAmount: row.amount.toFixed(2), discountAmount: '0', freightAmount: '0', totalAmount: row.amount.toFixed(2), dueDate: row.due, paidAt: row.paid ? new Date(`${row.paid}T12:00:00-03:00`) : null, status: row.paid ? 'PAID' : 'OPEN', notes: 'Compra fictícia para demonstração local.' }).returning();
      await tx.insert(purchaseItems).values({ purchaseId: purchase.id, description: row.description, quantity: '1', unit: 'UNIT', unitPrice: row.amount.toFixed(2), totalPrice: row.amount.toFixed(2), notes: 'Item demonstrativo.' });
    }
  });
  console.log(process.env.SEED_DEMO_DATA === 'true' ? 'Seed demonstrativo idempotente aplicado.' : 'Seed estrutural aplicado.');
}

try {
  await runSeed();
} finally {
  await closeDb();
}

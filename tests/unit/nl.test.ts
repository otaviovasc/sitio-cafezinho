import { describe, expect, it } from 'vitest';
import { parseMilkImport } from '../../src/domain/import';
import { matchAnimalByLabel } from '../../src/domain/nl/matching';
import {
  extractLotNumber,
  resolveDailyMilkTotal,
  resolveHerdGroup,
  resolveIndividualMilkSession,
  resolveMastitis,
  resolveMilkCollection,
  resolvePurchase,
  resolveRevenue,
  resolveSpokenDate,
  type ResolvableGroup,
} from '../../src/domain/nl/resolve';
import type {
  DailyMilkTotalIntent,
  IndividualMilkSessionIntent,
  MastitisIntent,
  MilkCollectionIntent,
  PurchaseIntent,
  RevenueIntent,
  SpokenDate,
} from '../../src/domain/nl/intents';

const NOW = new Date('2026-07-17T12:00:00-03:00');

const groups: ResolvableGroup[] = [
  { id: 'g1', name: 'Lote 1', milkingRoutine: 'MORNING_AND_AFTERNOON', active: true },
  { id: 'g2', name: 'Lote 2', milkingRoutine: 'MORNING_ONLY', active: true },
];

function spoken(relative: SpokenDate['relative'], rawText: string): SpokenDate {
  return { relative, iso: null, rawText };
}

function daily(scopeLabel: string | null, morning: number | null, afternoon: number | null): DailyMilkTotalIntent {
  return {
    type: 'daily_milk_total',
    date: spoken('hoje', 'hoje'),
    scopeLabel,
    morningLiters: morning,
    afternoonLiters: afternoon,
    rawValueText: null,
    confidence: 'HIGH',
    notes: null,
  };
}

describe('resolveSpokenDate', () => {
  it('resolve hoje/ontem/anteontem no fuso de São Paulo com now injetado', () => {
    expect(resolveSpokenDate(spoken('hoje', 'hoje'), NOW)).toBe('2026-07-17');
    expect(resolveSpokenDate(spoken('ontem', 'ontem'), NOW)).toBe('2026-07-16');
    expect(resolveSpokenDate(spoken('anteontem', 'anteontem'), NOW)).toBe('2026-07-15');
  });

  it('usa a data explícita quando informada', () => {
    expect(resolveSpokenDate({ relative: null, iso: '2026-01-09', rawText: '9 de janeiro' }, NOW)).toBe('2026-01-09');
  });
});

describe('resolveHerdGroup (ordinais)', () => {
  it('reconhece "primeiro lote" e "segundo lote"', () => {
    expect(resolveHerdGroup('primeiro lote', groups).group?.id).toBe('g1');
    expect(resolveHerdGroup('segundo lote', groups).group?.id).toBe('g2');
  });

  it('reconhece "lote 2" pelo nome exato e "lote dois" pela palavra', () => {
    expect(resolveHerdGroup('lote 2', groups).group?.id).toBe('g2');
    expect(resolveHerdGroup('lote dois', groups).group?.id).toBe('g2');
  });

  it('rebanho todo quando não há escopo', () => {
    expect(resolveHerdGroup(null, groups).group).toBeNull();
    expect(resolveHerdGroup(null, groups).issues).toHaveLength(0);
  });

  it('lote desconhecido vira pendência, nunca palpite', () => {
    const result = resolveHerdGroup('terceiro lote', groups);
    expect(result.group).toBeNull();
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('extractLotNumber lê dígito e palavra', () => {
    expect(extractLotNumber('primeiro lote')).toBe(1);
    expect(extractLotNumber('lote 2')).toBe(2);
    expect(extractLotNumber('rebanho todo')).toBeNull();
  });
});

describe('resolveDailyMilkTotal — exemplos reais (entrada incremental por período)', () => {
  it('Exemplo 1: "primeiro lote 700 de manhã" → READY (a tarde entra depois)', () => {
    const resolved = resolveDailyMilkTotal(daily('primeiro lote', 700, null), groups, NOW);
    expect(resolved.commitStatus).toBe('READY');
    expect(resolved.resolvedPayload.herdGroupId).toBe('g1');
    expect(resolved.resolvedPayload.morningLiters).toBe(700);
  });

  it('Exemplo 1: "segundo lote 300 de manhã" → READY (lote só de manhã)', () => {
    const resolved = resolveDailyMilkTotal(daily('segundo lote', 300, null), groups, NOW);
    expect(resolved.commitStatus).toBe('READY');
    expect(resolved.resolvedPayload.herdGroupId).toBe('g2');
  });

  it('Exemplo 2: "primeiro lote 600 à tarde" → READY (só a tarde já é salvável)', () => {
    const resolved = resolveDailyMilkTotal(daily('primeiro lote', null, 600), groups, NOW);
    expect(resolved.commitStatus).toBe('READY');
    expect(resolved.resolvedPayload.morningLiters).toBeNull();
    expect(resolved.resolvedPayload.afternoonLiters).toBe(600);
  });

  it('Rebanho todo só de manhã → READY', () => {
    const resolved = resolveDailyMilkTotal(daily(null, 500, null), groups, NOW);
    expect(resolved.commitStatus).toBe('READY');
    expect(resolved.resolvedPayload.herdGroupId).toBeNull();
  });

  it('Rebanho todo com manhã e tarde → READY', () => {
    const resolved = resolveDailyMilkTotal(daily(null, 500, 400), groups, NOW);
    expect(resolved.commitStatus).toBe('READY');
  });

  it('Tarde em lote que só ordenha de manhã → NEEDS_REVIEW', () => {
    const resolved = resolveDailyMilkTotal(daily('segundo lote', null, 300), groups, NOW);
    expect(resolved.commitStatus).toBe('NEEDS_REVIEW');
  });

  it('Sem nenhum valor → NEEDS_REVIEW', () => {
    const resolved = resolveDailyMilkTotal(daily('primeiro lote', null, null), groups, NOW);
    expect(resolved.commitStatus).toBe('NEEDS_REVIEW');
  });
});

describe('resolveIndividualMilkSession — Exemplo 3', () => {
  it('produz JSON de importação que passa por parseMilkImport', () => {
    const intent: IndividualMilkSessionIntent = {
      type: 'individual_milk_session',
      date: spoken('ontem', 'ontem'),
      measurements: [
        { animalLabel: 'Mimosa', morningLiters: 7, afternoonLiters: null, totalLiters: 7, rawValueText: '7 litros', confidence: 'HIGH', notes: null },
        { animalLabel: 'Cocada', morningLiters: 9.5, afternoonLiters: null, totalLiters: 9.5, rawValueText: '9 e meio', confidence: 'HIGH', notes: null },
      ],
    };
    const resolved = resolveIndividualMilkSession(intent, NOW);
    const importObject = (resolved.resolvedPayload as { import: unknown }).import;
    const parsed = parseMilkImport(JSON.stringify(importObject));
    expect(parsed.sessionDate).toBe('2026-07-16');
    expect(parsed.sourceMode).toBe('SEPARATE_MORNING_AFTERNOON');
    expect(parsed.measurements).toHaveLength(2);
    expect(parsed.measurements[0].rawAnimalLabel).toBe('Mimosa');
    expect(parsed.measurements[1].totalLiters).toBe(9.5);
  });
});

describe('resolvers de registro — mapeamento de rótulos falados', () => {
  it('coleta: volume + origem "tanque" → READY / TANK_READING', () => {
    const intent: MilkCollectionIntent = { type: 'milk_collection', date: spoken('hoje', 'hoje'), liters: 1200, sourceLabel: 'tanque', rawValueText: '1200', confidence: 'HIGH', notes: null };
    const resolved = resolveMilkCollection(intent, NOW);
    expect(resolved.commitStatus).toBe('READY');
    expect(resolved.resolvedPayload.source).toBe('TANK_READING');
    expect(resolved.resolvedPayload.collectionDate).toBe('2026-07-17');
  });

  it('coleta sem volume → NEEDS_REVIEW', () => {
    const intent: MilkCollectionIntent = { type: 'milk_collection', date: spoken('hoje', 'hoje'), liters: null, sourceLabel: null, rawValueText: null, confidence: 'LOW', notes: null };
    expect(resolveMilkCollection(intent, NOW).commitStatus).toBe('NEEDS_REVIEW');
  });

  it('receita: "venda de leite" recebida → MILK_SALE / RECEIVED', () => {
    const intent: RevenueIntent = { type: 'revenue', date: spoken('hoje', 'hoje'), categoryLabel: 'venda de leite', description: 'Leite da quinzena', amount: 5000, received: true, buyerName: 'Laticínio X', confidence: 'HIGH', notes: null };
    const resolved = resolveRevenue(intent, NOW);
    expect(resolved.commitStatus).toBe('READY');
    expect(resolved.resolvedPayload.category).toBe('MILK_SALE');
    expect(resolved.resolvedPayload.status).toBe('RECEIVED');
  });

  it('compra: "ração" com fornecedor cadastrado + vencimento → FEED / supplierId / OPEN', () => {
    const suppliers = [{ id: 's1', name: 'Agropecuária X' }];
    const intent: PurchaseIntent = { type: 'purchase', date: spoken('hoje', 'hoje'), categoryLabel: 'ração', description: 'Ração 2 sacos', amount: 1200, supplierLabel: 'Agropecuária X', dueDate: { relative: null, iso: '2026-08-10', rawText: 'dia 10' }, paid: false, confidence: 'HIGH', notes: null };
    const resolved = resolvePurchase(intent, suppliers, NOW);
    expect(resolved.commitStatus).toBe('READY');
    expect(resolved.resolvedPayload.category).toBe('FEED');
    expect(resolved.resolvedPayload.supplierId).toBe('s1');
    expect(resolved.resolvedPayload.status).toBe('OPEN');
    expect(resolved.resolvedPayload.dueDate).toBe('2026-08-10');
  });

  it('mastite: vaca conhecida + quarto → READY / REAR_RIGHT; desconhecida → NEEDS_REVIEW', () => {
    const animals = [{ id: 'a1', name: 'Mimosa', tagNumber: null }];
    const known: MastitisIntent = { type: 'mastitis_case', date: spoken('hoje', 'hoje'), animalLabel: 'Mimosa', quarterLabel: 'posterior direito', detectionLabel: 'visual', observedSigns: 'leite com grumos', confidence: 'HIGH', notes: null };
    const resolvedKnown = resolveMastitis(known, animals, [], NOW);
    expect(resolvedKnown.commitStatus).toBe('READY');
    expect(resolvedKnown.resolvedPayload.animalId).toBe('a1');
    expect(resolvedKnown.resolvedPayload.affectedQuarter).toBe('REAR_RIGHT');
    expect(resolvedKnown.resolvedPayload.detectionMethod).toBe('VISUAL');

    const unknown: MastitisIntent = { ...known, animalLabel: 'Estrela' };
    const resolvedUnknown = resolveMastitis(unknown, animals, [], NOW);
    expect(resolvedUnknown.commitStatus).toBe('NEEDS_REVIEW');
    expect(resolvedUnknown.resolvedPayload.animalId).toBeNull();
  });
});

describe('matchAnimalByLabel — paridade com o casamento exato existente', () => {
  const animals = [
    { id: 'a1', name: 'Mimosa', tagNumber: null },
    { id: 'a2', name: 'Cocada', tagNumber: '42' },
  ];
  const aliases = [{ animalId: 'a1', normalizedAlias: 'mimosinha' }];

  it('casa por nome normalizado (com e sem acento/caixa)', () => {
    expect(matchAnimalByLabel('mimosa', animals, aliases)?.id).toBe('a1');
    expect(matchAnimalByLabel('MIMOSA', animals, aliases)?.id).toBe('a1');
  });

  it('casa por brinco e por alias', () => {
    expect(matchAnimalByLabel('42', animals, aliases)?.id).toBe('a2');
    expect(matchAnimalByLabel('Mimosinha', animals, aliases)?.id).toBe('a1');
  });

  it('rótulo desconhecido não casa', () => {
    expect(matchAnimalByLabel('Estrela', animals, aliases)).toBeUndefined();
  });
});

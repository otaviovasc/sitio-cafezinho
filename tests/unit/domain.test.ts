import { describe, expect, it } from 'vitest';
import { sha256 } from '../../src/domain/files';
import { allowedNextStatuses, canTransitionStatus, isProductiveCycleTransition, statusEndsMilkingGroup, statusRequiresMilkingGroup } from '../../src/domain/animal-lifecycle';
import { filterByPeriod } from '../../src/domain/analytics';
import { calculateDailyMilkTotal, resolveDailyMilkByDate, summarizeDailyMilk } from '../../src/domain/daily-milk';
import { formatDate, formatLiters, formatMoney, normalizeLabel, parseDecimal } from '../../src/domain/format';
import { participatesInMilking, requiresAfternoonMeasurement } from '../../src/domain/herd';
import { formatChatGptImportIssues, parseChatGptImport, stripMarkdownJson } from '../../src/domain/import';
import { calculateTotal, confirmedTotal, estimateSplit } from '../../src/domain/milk';
import { summarizeMilkDay } from '../../src/domain/milk-collection';
import { isMonthKey, monthStorageDate, summarizeMonthlyMilkPrice } from '../../src/domain/milk-price';
import { isOpenMastitisStatus, mastitisActionTiming, withdrawalState } from '../../src/domain/mastitis';
import { summarizeRegisteredCash } from '../../src/domain/finance';
import { dateKeyInSaoPaulo, isOverdue, itemDifference } from '../../src/domain/purchases';
import { summarizeReproduction } from '../../src/domain/reproduction';
import { formatWeight, parseWeightImport, weightChange } from '../../src/domain/weight';

describe('formatação e normalização', () => {
  it('aceita decimal brasileiro e ponto', () => {
    expect(parseDecimal('13,5')).toBe(13.5);
    expect(parseDecimal('13.5')).toBe(13.5);
    expect(parseDecimal('1.234,56')).toBe(1234.56);
    expect(parseDecimal('1,234.56')).toBe(1234.56);
    expect(parseDecimal('texto')).toBeNull();
  });

  it('formata valores para pt-BR', () => {
    expect(formatLiters(13.5)).toBe('13,5 L');
    expect(formatMoney(1234.56)).toContain('1.234,56');
    expect(formatDate('2026-05-06')).toBe('06/05/2026');
  });

  it('normaliza acentos e espaços sem alterar o original', () => {
    expect(normalizeLabel('  Saúde  ')).toBe('saude');
  });
});

describe('produção de leite', () => {
  it('calcula o total diário a partir da manhã e da tarde', () => {
    expect(calculateDailyMilkTotal(410.25, 302.1)).toBe(712.35);
    expect(calculateDailyMilkTotal(210, null)).toBe(210);
  });
  it('aplica a regra configurável do grupo sem inventar ordenha à tarde', () => {
    expect(participatesInMilking('MORNING_AND_AFTERNOON')).toBe(true);
    expect(participatesInMilking('MORNING_ONLY')).toBe(true);
    expect(participatesInMilking('NOT_MILKED')).toBe(false);
    expect(requiresAfternoonMeasurement('MORNING_AND_AFTERNOON')).toBe(true);
    expect(requiresAfternoonMeasurement('MORNING_ONLY')).toBe(false);
  });

  it('filtra a evolução pelo período escolhido sem inventar dias', () => {
    const rows = [{ date: '2026-04-01' }, { date: '2026-07-01' }, { date: '2026-07-15' }];
    expect(filterByPeriod(rows, 30, '2026-07-15')).toEqual([{ date: '2026-07-01' }, { date: '2026-07-15' }]);
    expect(filterByPeriod(rows, null, '2026-07-15')).toEqual(rows);
  });
  it('resume somente os dias realmente medidos no mês', () => {
    const summary = summarizeDailyMilk([
      { productionDate: '2026-07-01', totalLiters: 600 },
      { productionDate: '2026-07-03', totalLiters: 620 },
      { productionDate: '2026-06-30', totalLiters: 590 },
    ], '2026-07');
    expect(summary).toEqual({ measuredDays: 2, total: 1220, average: 610 });
  });

  it('aceita produção por lote sem contar duas vezes quando há total do rebanho', () => {
    const rows = [
      { id: 'geral', productionDate: '2026-07-01', herdGroupId: null, totalLiters: 385 },
      { id: 'lote-1', productionDate: '2026-07-01', herdGroupId: 'grupo-1', totalLiters: 210 },
      { id: 'lote-2', productionDate: '2026-07-01', herdGroupId: 'grupo-2', totalLiters: 175 },
      { id: 'lote-3', productionDate: '2026-07-02', herdGroupId: 'grupo-1', totalLiters: 200 },
      { id: 'lote-4', productionDate: '2026-07-02', herdGroupId: 'grupo-2', totalLiters: 150 },
    ];
    expect(resolveDailyMilkByDate(rows)).toEqual([
      { productionDate: '2026-07-01', totalLiters: 385, basis: 'HERD_TOTAL', groupCount: 2, recordIds: ['geral'] },
      { productionDate: '2026-07-02', totalLiters: 350, basis: 'GROUP_SUM', groupCount: 2, recordIds: ['lote-3', 'lote-4'] },
    ]);
    expect(summarizeDailyMilk(rows, '2026-07')).toEqual({ measuredDays: 2, total: 735, average: 367.5 });
  });

  it('compara produção e coleta como fatos independentes', () => {
    expect(summarizeMilkDay(385, [360])).toEqual({ productionLiters: 385, collectedLiters: 360, differenceLiters: 25 });
    expect(summarizeMilkDay(null, [180, 180])).toEqual({ productionLiters: null, collectedLiters: 360, differenceLiters: null });
  });

  it('estima o valor somente a partir das coletas e do preço mensal informado', () => {
    expect(summarizeMonthlyMilkPrice([{ liters: '360.50' }, { liters: 339.5 }], '1.7200')).toEqual({
      collectedLiters: 700,
      collectionCount: 2,
      pricePerLiter: 1.72,
      estimatedValue: 1204,
      estimateBasis: 'COLLECTED_LITERS_X_MONTHLY_PRICE',
    });
    expect(summarizeMonthlyMilkPrice([{ liters: 700 }], null)).toEqual({
      collectedLiters: 700,
      collectionCount: 1,
      pricePerLiter: null,
      estimatedValue: null,
      estimateBasis: null,
    });
  });

  it('normaliza somente chaves de mês válidas para o primeiro dia', () => {
    expect(isMonthKey('2026-07')).toBe(true);
    expect(isMonthKey('2026-13')).toBe(false);
    expect(isMonthKey('julho')).toBe(false);
    expect(monthStorageDate('2026-07')).toBe('2026-07-01');
  });

  it('soma manhã e tarde', () => expect(calculateTotal(12, 9)).toBe(21));

  it('mantém pendentes e excluídos fora do total', () => {
    expect(confirmedTotal([
      { totalLiters: 20, status: 'CONFIRMED' },
      { totalLiters: 13, status: 'NEEDS_REVIEW' },
      { totalLiters: 10, status: 'EXCLUDED' },
    ])).toBe(20);
  });

  it('usa 50/50 quando não há histórico suficiente', () => {
    expect(estimateSplit(21, 'a', [])).toEqual({ morning: 10.5, afternoon: 10.5, method: 'DEFAULT_50_50', description: 'Divisão padrão 50/50' });
  });

  it('usa até cinco medições reais do animal após três controles', () => {
    const result = estimateSplit(20, 'a', [
      { animalId: 'a', morning: 12, afternoon: 8, date: '2026-01-03' },
      { animalId: 'a', morning: 12, afternoon: 8, date: '2026-01-02' },
      { animalId: 'a', morning: 12, afternoon: 8, date: '2026-01-01' },
    ]);
    expect(result.method).toBe('ANIMAL_HISTORY');
    expect(result.morning).toBe(12);
  });

  it('usa histórico real do rebanho quando há dez medições', () => {
    const history = Array.from({ length: 10 }, (_, index) => ({ animalId: String(index), morning: 14, afternoon: 6, date: `2026-01-${String(index + 1).padStart(2, '0')}` }));
    const result = estimateSplit(20, 'sem-historico', history);
    expect(result.method).toBe('HERD_HISTORY');
    expect(result.morning).toBe(14);
  });

  it('não usa medições futuras para estimar um controle antigo', () => {
    const future = Array.from({ length: 10 }, (_, index) => ({ animalId: String(index), morning: 14, afternoon: 6, date: `2026-06-${String(index + 1).padStart(2, '0')}` }));
    const result = estimateSplit(20, 'sem-historico', future, '2026-05-06');
    expect(result.method).toBe('DEFAULT_50_50');
    expect(result.morning).toBe(10);
  });
});

describe('ciclo produtivo e reprodução', () => {
  it('mantém novilha, lactação e seca como fases explícitas', () => {
    expect(allowedNextStatuses('HEIFER')).toEqual(['LACTATING', 'SOLD', 'DEAD']);
    expect(canTransitionStatus('HEIFER', 'DRY')).toBe(false);
    expect(canTransitionStatus('LACTATING', 'DRY')).toBe(true);
    expect(canTransitionStatus('DRY', 'LACTATING')).toBe(true);
  });

  it('resume somente fatos reprodutivos do ciclo atual', () => {
    expect(summarizeReproduction([
      { type: 'HEAT', occurredOn: '2026-04-01', hadBreeding: true, outcome: 'PREGNANT' },
      { type: 'CALVING', occurredOn: '2026-06-01', hadBreeding: false, outcome: null },
      { type: 'HEAT', occurredOn: '2026-07-01', hadBreeding: true, outcome: 'NOT_PREGNANT' },
      { type: 'HEAT', occurredOn: '2026-07-12', hadBreeding: true, outcome: 'PENDING' },
    ])).toEqual({
      lastCalvingOn: '2026-06-01',
      lastHeatOn: '2026-07-12',
      attemptsInCurrentCycle: 2,
      pendingAttempts: 1,
      lastPregnancyOn: null,
      attemptsUntilLastPregnancy: null,
    });
  });
});

describe('ciclo produtivo', () => {
  it('separa situação produtiva de lote de ordenha', () => {
    expect(statusRequiresMilkingGroup('LACTATING')).toBe(true);
    expect(statusRequiresMilkingGroup('DRY')).toBe(false);
    expect(statusEndsMilkingGroup('DRY')).toBe(true);
    expect(isProductiveCycleTransition('LACTATING', 'DRY')).toBe(true);
    expect(isProductiveCycleTransition('DRY', 'LACTATING')).toBe(true);
  });
});

describe('compras', () => {
  it('deriva vencimento apenas para compra aberta', () => {
    const today = new Date('2026-07-15T12:00:00-03:00');
    expect(isOverdue({ status: 'OPEN', dueDate: '2026-07-14' }, today)).toBe(true);
    expect(isOverdue({ status: 'PAID', dueDate: '2026-07-14' }, today)).toBe(false);
  });

  it('usa a data da propriedade mesmo quando o servidor está em UTC', () => {
    expect(dateKeyInSaoPaulo(new Date('2026-07-16T01:30:00Z'))).toBe('2026-07-15');
  });

  it('calcula divergência dos itens sem mudar o total', () => {
    expect(itemDifference(100, [{ totalPrice: 40 }, { totalPrice: 55 }])).toBe(-5);
  });

  it('calcula somente o caixa registrado e ignora cancelados', () => {
    expect(summarizeRegisteredCash([
      { status: 'RECEIVED', amount: 1200 }, { status: 'EXPECTED', amount: 500 }, { status: 'CANCELLED', amount: 300 },
    ], [
      { status: 'PAID', totalAmount: 450 }, { status: 'OPEN', totalAmount: 200 }, { status: 'CANCELLED', totalAmount: 100 },
    ])).toEqual({ received: 1200, expected: 500, paid: 450, open: 200, cashResult: 750 });
  });
});

describe('mastite', () => {
  it('mantém recorrência aberta e resolução apenas no histórico', () => {
    expect(isOpenMastitisStatus('RECURRENT')).toBe(true);
    expect(isOpenMastitisStatus('NO_IMPROVEMENT')).toBe(true);
    expect(isOpenMastitisStatus('RESOLVED')).toBe(false);
    expect(isOpenMastitisStatus('CANCELLED')).toBe(false);
  });

  it('distingue ação de hoje, atrasada e concluída', () => {
    expect(mastitisActionTiming({ scheduledFor: '2026-07-15T12:00:00-03:00' }, '2026-07-15')).toBe('TODAY');
    expect(mastitisActionTiming({ scheduledFor: '2026-07-14T12:00:00-03:00' }, '2026-07-15')).toBe('OVERDUE');
    expect(mastitisActionTiming({ scheduledFor: '2026-07-14T12:00:00-03:00', completedAt: '2026-07-14T13:00:00-03:00' }, '2026-07-15')).toBe('COMPLETED');
  });

  it('mantém a carência como data informada e não libera automaticamente', () => {
    expect(withdrawalState('2026-07-18', 'WITHDRAWAL_PERIOD', '2026-07-15')).toEqual({ days: 3, state: 'ACTIVE' });
    expect(withdrawalState('2026-07-15', 'WITHDRAWAL_PERIOD', '2026-07-15')).toEqual({ days: 0, state: 'ENDS_TODAY' });
    expect(withdrawalState('2026-07-14', 'WITHDRAWAL_PERIOD', '2026-07-15')).toEqual({ days: -1, state: 'PAST_DUE' });
    expect(withdrawalState('2026-07-18', 'RESOLVED', '2026-07-15')).toBeNull();
  });
});

describe('peso animal', () => {
  it('calcula somente a variação entre duas medições reais', () => {
    expect(weightChange(485.5, 480)).toBe(5.5);
    expect(weightChange(485.5, null)).toBeNull();
    expect(formatWeight(485.5)).toBe('485,5 kg');
  });

  it('preserva rótulo e aceita peso ilegível na importação para revisão', () => {
    const parsed = parseWeightImport(JSON.stringify({ measuredOn: '2026-07-08', measurements: [{ rawAnimalLabel: '512', rawValueText: '490?', weightKg: null, confidence: 'LOW', excluded: false, notes: 'Dúvida' }] }));
    expect(parsed.measurements[0].rawAnimalLabel).toBe('512');
    expect(parsed.measurements[0].weightKg).toBeNull();
  });
});

describe('importação do ChatGPT', () => {
  const valid = { sessionDate: '2026-05-06', sourceMode: 'COMBINED_TOTAL', measurements: [{ rawAnimalLabel: 'Caruja', morningLiters: null, afternoonLiters: null, totalLiters: 21, confidence: 'HIGH', excluded: false, notes: null }] };

  it('remove cerca Markdown acidental e valida null', () => {
    const fenced = `\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``;
    expect(stripMarkdownJson(fenced)).toBe(JSON.stringify(valid));
    expect(parseChatGptImport(fenced).measurements[0].totalLiters).toBe(21);
  });

  it('rejeita valores negativos e divergência', () => {
    expect(() => parseChatGptImport(JSON.stringify({ ...valid, measurements: [{ ...valid.measurements[0], totalLiters: -1 }] }))).toThrow();
    expect(() => parseChatGptImport(JSON.stringify({ ...valid, measurements: [{ ...valid.measurements[0], morningLiters: 12, afternoonLiters: 9, totalLiters: 20 }] }))).toThrow();
  });

  it('preserva para revisão linhas riscadas sem valor e linha sem rótulo legível', () => {
    const parsed = parseChatGptImport(JSON.stringify({
      sessionDate: '2026-07-16',
      sourceMode: 'SEPARATE_MORNING_AFTERNOON',
      measurements: [
        { rawAnimalLabel: 'Kiltora', morningLiters: null, afternoonLiters: null, totalLiters: null, confidence: 'LOW', excluded: true, notes: 'Linha riscada no caderno; sem valor legível' },
        { rawAnimalLabel: 'Helen', morningLiters: null, afternoonLiters: null, totalLiters: null, confidence: 'LOW', excluded: true, notes: 'Linha riscada no caderno; rótulo e valor pouco legíveis' },
        { rawAnimalLabel: null, morningLiters: null, afternoonLiters: null, totalLiters: null, confidence: 'LOW', excluded: true, notes: 'Linha riscada e ilegível no controle da tarde' },
      ],
    }));

    expect(parsed.measurements).toEqual([
      expect.objectContaining({ rawAnimalLabel: 'Kiltora', totalLiters: null, excluded: true }),
      expect.objectContaining({ rawAnimalLabel: 'Helen', totalLiters: null, excluded: true }),
      expect.objectContaining({ rawAnimalLabel: '[rótulo ilegível]', totalLiters: null, excluded: true }),
    ]);
  });

  it('identifica a linha e o campo quando o JSON precisa de correção', () => {
    try {
      parseChatGptImport(JSON.stringify({ ...valid, measurements: [{ ...valid.measurements[0], rawAnimalLabel: null }] }));
      throw new Error('A validação deveria falhar.');
    } catch (error) {
      expect(formatChatGptImportIssues(error as import('zod').ZodError)).toBe('Linha 1 · rótulo do animal: Informe o rótulo do animal ou marque a linha como excluída.');
    }
  });
});

it('calcula SHA-256 de arquivo', () => {
  expect(sha256(Buffer.from('sitio'))).toMatch(/^[a-f0-9]{64}$/);
});

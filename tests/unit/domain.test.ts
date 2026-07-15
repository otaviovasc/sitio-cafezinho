import { describe, expect, it } from 'vitest';
import { sha256 } from '../../src/domain/files';
import { allowedNextStatuses, canTransitionStatus, isProductiveCycleTransition, statusEndsMilkingGroup, statusRequiresMilkingGroup } from '../../src/domain/animal-lifecycle';
import { filterByPeriod } from '../../src/domain/analytics';
import { calculateDailyMilkTotal, summarizeDailyMilk } from '../../src/domain/daily-milk';
import { formatDate, formatLiters, formatMoney, normalizeLabel, parseDecimal } from '../../src/domain/format';
import { participatesInMilking, requiresAfternoonMeasurement } from '../../src/domain/herd';
import { parseChatGptImport, stripMarkdownJson } from '../../src/domain/import';
import { calculateTotal, confirmedTotal, estimateSplit } from '../../src/domain/milk';
import { dateKeyInSaoPaulo, isOverdue, itemDifference } from '../../src/domain/purchases';
import { summarizeReproduction } from '../../src/domain/reproduction';
import { formatWeight, parseWeightImport, weightChange } from '../../src/domain/weight';

describe('formatação e normalização', () => {
  it('aceita decimal brasileiro e ponto', () => {
    expect(parseDecimal('13,5')).toBe(13.5);
    expect(parseDecimal('13.5')).toBe(13.5);
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
});

it('calcula SHA-256 de arquivo', () => {
  expect(sha256(Buffer.from('sitio'))).toMatch(/^[a-f0-9]{64}$/);
});

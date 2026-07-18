import { describe, expect, it } from 'vitest';
import { summarizeGameEconomy } from '../../src/domain/game/economy';

const collections = [
  { collectionDate: '2026-07-02', liters: '400.50' },
  { collectionDate: '2026-07-10', liters: 350 },
  { collectionDate: '2026-06-28', liters: 999 },
];
const purchases = [
  { purchaseDate: '2026-07-05', status: 'PAID', totalAmount: '250.00' },
  { purchaseDate: '2026-07-08', status: 'OPEN', totalAmount: 100 },
  { purchaseDate: '2026-07-09', status: 'CANCELLED', totalAmount: 9999 },
  { purchaseDate: '2026-06-01', status: 'PAID', totalAmount: 500 },
];

describe('summarizeGameEconomy', () => {
  it('sem preço do mês: receita e resultado null, nunca inventa valor', () => {
    const economy = summarizeGameEconomy(collections, null, purchases, '2026-07');
    expect(economy.milkLiters).toBeCloseTo(750.5);
    expect(economy.pricePerLiter).toBeNull();
    expect(economy.milkRevenue).toBeNull();
    expect(economy.result).toBeNull();
    expect(economy.purchasesTotal).toBeCloseTo(350);
  });

  it('com preço: litros do mês × preço − compras (CANCELLED e outros meses fora)', () => {
    const economy = summarizeGameEconomy(collections, '2.00', purchases, '2026-07');
    expect(economy.milkRevenue).toBeCloseTo(1501);
    expect(economy.purchasesTotal).toBeCloseTo(350);
    expect(economy.result).toBeCloseTo(1151);
  });

  it('arredonda a 2 casas (padrão do financeiro)', () => {
    const economy = summarizeGameEconomy([{ collectionDate: '2026-07-01', liters: '333.333' }], '1.111', [], '2026-07');
    expect(economy.milkLiters).toBe(333.33);
    expect(economy.milkRevenue).toBe(370.33);
  });

  it('mês sem nada: zeros e nulls coerentes', () => {
    const economy = summarizeGameEconomy([], null, [], '2026-01');
    expect(economy).toMatchObject({ milkLiters: 0, milkRevenue: null, purchasesTotal: 0, result: null });
  });
});

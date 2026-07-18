import { summarizeMonthlyMilkPrice } from '../milk-price.js';

/**
 * Economia REAL do mês para o HUD do jogo: litros entregues × preço do mês
 * menos compras (exceto canceladas). Sem preço cadastrado, receita e resultado
 * ficam null — o HUD pede o cadastro em vez de inventar valor.
 */
export type GameEconomy = {
  month: string;
  milkLiters: number;
  pricePerLiter: number | null;
  milkRevenue: number | null;
  purchasesTotal: number;
  result: number | null;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function summarizeGameEconomy(
  collections: Array<{ collectionDate: string; liters: string | number }>,
  monthPricePerLiter: string | number | null,
  purchases: Array<{ purchaseDate: string; status: string; totalAmount: string | number }>,
  month: string,
): GameEconomy {
  const monthCollections = collections.filter((row) => row.collectionDate.startsWith(month));
  const milk = summarizeMonthlyMilkPrice(monthCollections, monthPricePerLiter);
  const purchasesTotal = roundMoney(
    purchases
      .filter((row) => row.purchaseDate.startsWith(month) && row.status !== 'CANCELLED')
      .reduce((sum, row) => sum + Number(row.totalAmount), 0),
  );
  return {
    month,
    milkLiters: milk.collectedLiters,
    pricePerLiter: milk.pricePerLiter,
    milkRevenue: milk.estimatedValue,
    purchasesTotal,
    result: milk.estimatedValue === null ? null : roundMoney(milk.estimatedValue - purchasesTotal),
  };
}

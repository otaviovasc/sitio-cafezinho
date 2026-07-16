export function summarizeMilkDay(productionLiters: string | number | null, collectionLiters: Array<string | number>) {
  const collected = Math.round(collectionLiters.reduce<number>((sum, value) => sum + Number(value), 0) * 100) / 100;
  const production = productionLiters === null ? null : Number(productionLiters);
  return {
    productionLiters: production,
    collectedLiters: collected,
    differenceLiters: production === null ? null : Math.round((production - collected) * 100) / 100,
  };
}

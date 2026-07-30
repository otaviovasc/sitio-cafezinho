export function collectLatestProductionsByAnimal<T extends { animalId: string | null }>(
  orderedMeasurements: T[],
  limit = 2,
) {
  const byAnimal = new Map<string, T[]>();
  for (const measurement of orderedMeasurements) {
    if (!measurement.animalId) continue;
    const latest = byAnimal.get(measurement.animalId) ?? [];
    if (latest.length === limit) continue;
    latest.push(measurement);
    byAnimal.set(measurement.animalId, latest);
  }
  return byAnimal;
}

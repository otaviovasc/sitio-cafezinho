/**
 * Ciclo de crescimento da plantação (funções puras, compartilhadas entre
 * servidor e cliente). O plantio real registra insumos gastos e uma duração
 * configurável; o progresso é sempre DERIVADO do relógio (plantedAt +
 * durationHours), nunca armazenado — o servidor decide "pronto" com a mesma
 * função que o cliente usa para desenhar o talhão.
 */

export type PlantingGrowthStage = 'SPROUT' | 'GROWING' | 'MATURE' | 'READY';

/** Fração 0–1 do ciclo decorrido; clampada (plantio no futuro = 0). */
export function growthProgress(plantedAt: string | Date, durationHours: number, now: Date): number {
  const start = (typeof plantedAt === 'string' ? new Date(plantedAt) : plantedAt).getTime();
  const totalMs = durationHours * 3_600_000;
  if (!Number.isFinite(start) || !Number.isFinite(totalMs) || totalMs <= 0) return 1;
  return Math.min(1, Math.max(0, (now.getTime() - start) / totalMs));
}

/** Estágio visual do talhão a partir do progresso (limiares em docs/game-design.md). */
export function growthStage(progress: number): PlantingGrowthStage {
  if (progress >= 1) return 'READY';
  if (progress >= 0.6) return 'MATURE';
  if (progress >= 0.25) return 'GROWING';
  return 'SPROUT';
}

export function plantingReadyAt(plantedAt: string | Date, durationHours: number): Date {
  const start = (typeof plantedAt === 'string' ? new Date(plantedAt) : plantedAt).getTime();
  return new Date(start + durationHours * 3_600_000);
}

/** "2 d 4 h" / "3 h 20 min" / "12 min" — tempo restante amigável para o HUD. */
export function formatRemaining(msRemaining: number): string {
  const minutes = Math.max(0, Math.ceil(msRemaining / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days} d ${restHours} h` : `${days} d`;
}

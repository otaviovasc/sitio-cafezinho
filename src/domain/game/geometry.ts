import type { MapPoint } from './state.js';

/**
 * Geometria pura do jogo. Anéis chegam em lat/lng (fonte única, traçados no
 * editor); as operações planas (área, centroide, ponto-no-polígono, Chaikin)
 * trabalham sobre pontos já projetados { x, y }. Nada aqui importa React,
 * Leaflet ou Drizzle.
 */

export type Vec = { x: number; y: number };

const MAX_RING_POINTS = 500;

/** Valida um anel cru vindo do traçado. Retorna mensagem de erro ou null. */
export function ringError(ring: MapPoint[]): string | null {
  if (!Array.isArray(ring) || ring.length < 3) return 'Trace pelo menos 3 pontos para fechar uma área.';
  if (ring.length > MAX_RING_POINTS) return `Use no máximo ${MAX_RING_POINTS} pontos.`;
  for (const point of ring) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return 'O traçado contém um ponto inválido.';
    if (point.lat < -90 || point.lat > 90 || point.lng < -180 || point.lng > 180) return 'O traçado contém coordenadas fora do mapa.';
  }
  return null;
}

/** Área com sinal (shoelace). Positiva para anel anti-horário. */
export function shoelaceArea(ring: Vec[]): number {
  let sum = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return sum / 2;
}

/** Centroide do polígono (ponderado por área; média simples se degenerado). */
export function centroid(ring: Vec[]): Vec {
  const area = shoelaceArea(ring);
  if (Math.abs(area) < 1e-9) {
    const sum = ring.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
    return { x: sum.x / ring.length, y: sum.y / ring.length };
  }
  let cx = 0;
  let cy = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    const cross = current.x * next.y - next.x * current.y;
    cx += (current.x + next.x) * cross;
    cy += (current.y + next.y) * cross;
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

/** Ray casting clássico; pontos exatamente na borda podem cair para qualquer lado. */
export function pointInPolygon(point: Vec, ring: Vec[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const a = ring[index];
    const b = ring[previous];
    const crossesY = a.y > point.y !== b.y > point.y;
    if (crossesY && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Suavização de Chaikin em anel fechado — a assinatura visual do jogo: o
 * traçado irregular do GPS vira forma orgânica de tabuleiro. Determinística;
 * cada iteração troca cada vértice pelo par (3/4, 1/4) das arestas vizinhas.
 */
export function roundRing(ring: Vec[], iterations = 2): Vec[] {
  let current = ring;
  for (let step = 0; step < iterations; step += 1) {
    const next: Vec[] = [];
    for (let index = 0; index < current.length; index += 1) {
      const a = current[index];
      const b = current[(index + 1) % current.length];
      next.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
      next.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
    }
    current = next;
  }
  return current;
}

/**
 * Pontos equiespaçados ao longo do anel fechado (para os mourões da cerca do
 * perímetro). Caminha o contorno acumulando distância e emite um ponto a cada
 * `spacing`, começando no primeiro vértice. Determinístico.
 */
export function spacedPointsAlongRing(ring: Vec[], spacing: number): Vec[] {
  if (ring.length < 2 || spacing <= 0) return [];
  const points: Vec[] = [ring[0]];
  let carried = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const from = ring[index];
    const to = ring[(index + 1) % ring.length];
    const segment = Math.hypot(to.x - from.x, to.y - from.y);
    if (segment === 0) continue;
    let travelled = spacing - carried;
    while (travelled <= segment) {
      const ratio = travelled / segment;
      points.push({ x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio });
      travelled += spacing;
    }
    carried = (carried + segment) % spacing;
  }
  // O caminho fecha no ponto inicial: se o último emitido caiu praticamente
  // sobre ele, remove para não duplicar o mourão de partida.
  const last = points[points.length - 1];
  if (points.length > 1 && Math.hypot(last.x - ring[0].x, last.y - ring[0].y) < spacing * 0.35) points.pop();
  return points;
}

/** Caixa envolvente de um conjunto de pontos. */
export function boundingBox(points: Vec[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, minY, maxX, maxY };
}

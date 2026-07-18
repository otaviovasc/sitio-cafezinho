import { boundingBox, centroid, pointInPolygon, type Vec } from './geometry.js';

/**
 * Posições determinísticas do cluster de vacas dentro de um pasto. Sem
 * Math.random: o gerador é semeado pelo id do lote, então o mesmo rebanho no
 * mesmo pasto rende sempre o mesmo desenho (requisito dos testes visuais).
 */

/** Hash FNV-1a de 32 bits — estável entre execuções e plataformas. */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Gerador pseudo-aleatório determinístico (mulberry32). */
function mulberry32(state: number): () => number {
  let a = state;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Parâmetros do vagar de uma vaca no pasto (CSS custom props, sem Math.random). */
export type GrazeMotion = { dx: number; dy: number; durationMs: number; delayMs: number };

/**
 * Movimento de pastar determinístico por vaca: deslocamento pequeno (a vaca
 * fica no miolo do rebanho, longe da cerca) e duração/atraso variados para o
 * rebanho não se mover em bloco. Mesmo seed → mesmo movimento (testes visuais
 * desligam animações; o layout continua estável).
 */
export function herdGrazeMotion(seed: string, count: number, amplitude = 12, minMs = 9000, maxMs = 17000): GrazeMotion[] {
  const random = mulberry32(hashSeed(`${seed}:graze`));
  const motions: GrazeMotion[] = [];
  for (let index = 0; index < count; index += 1) {
    motions.push({
      dx: Math.round((random() * 2 - 1) * amplitude * 10) / 10,
      dy: Math.round((random() * 2 - 1) * amplitude * 10) / 10,
      durationMs: Math.round(minMs + random() * (maxMs - minMs)),
      delayMs: -Math.round(random() * maxMs),
    });
  }
  return motions;
}

/**
 * Distribui até `cap` pontos dentro do polígono (projetado). Amostra a caixa
 * envolvente e aceita só pontos internos; se o polígono for fino demais,
 * degrada para o centroide. Todos os pontos retornados estão dentro do anel.
 */
export function herdClusterLayout(polygon: Vec[], count: number, seed: string, cap = 8): Vec[] {
  if (count <= 0 || polygon.length < 3) return [];
  const placements = Math.min(count, cap);
  const random = mulberry32(hashSeed(seed));
  const box = boundingBox(polygon);
  const center = centroid(polygon);
  const anchor = pointInPolygon(center, polygon) ? center : null;
  const points: Vec[] = [];
  const maxAttempts = 60;
  for (let index = 0; index < placements; index += 1) {
    let placed: Vec | null = null;
    for (let attempt = 0; attempt < maxAttempts && !placed; attempt += 1) {
      // Concentra perto do centro (média de 2 amostras) para parecer um rebanho.
      const sampleX = box.minX + ((random() + random()) / 2) * (box.maxX - box.minX);
      const sampleY = box.minY + ((random() + random()) / 2) * (box.maxY - box.minY);
      const candidate = { x: sampleX, y: sampleY };
      if (pointInPolygon(candidate, polygon)) placed = candidate;
    }
    points.push(placed ?? anchor ?? polygon[0]);
  }
  return points;
}

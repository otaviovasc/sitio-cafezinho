import { boundingBox, type Vec } from './geometry.js';
import type { MapPoint } from './state.js';

/**
 * Projeção equiretangular local: lat/lng → coordenadas do viewBox do jogo.
 * Ancorada no anel do perímetro (fonte única em lat/lng), corrigida por
 * cos(latitude média) para não achatar o terreno. Preserva a razão de aspecto:
 * a largura do viewBox é fixa e a altura sai da forma real do sítio.
 */
export type GameProjection = {
  toLocal: (point: MapPoint) => Vec;
  width: number;
  height: number;
};

export function createProjection(perimeterRing: MapPoint[], viewBoxWidth = 1000, paddingRatio = 0.1): GameProjection {
  const meanLat = perimeterRing.reduce((sum, point) => sum + point.lat, 0) / perimeterRing.length;
  const stretch = Math.cos((meanLat * Math.PI) / 180);
  const planar = (point: MapPoint): Vec => ({ x: point.lng * stretch, y: -point.lat });

  const box = boundingBox(perimeterRing.map(planar));
  const rawWidth = Math.max(box.maxX - box.minX, 1e-9);
  const rawHeight = Math.max(box.maxY - box.minY, 1e-9);
  const padding = Math.max(rawWidth, rawHeight) * paddingRatio;
  const paddedWidth = rawWidth + padding * 2;
  const paddedHeight = rawHeight + padding * 2;
  const scale = viewBoxWidth / paddedWidth;

  return {
    toLocal: (point) => {
      const raw = planar(point);
      return {
        x: (raw.x - box.minX + padding) * scale,
        y: (raw.y - box.minY + padding) * scale,
      };
    },
    width: viewBoxWidth,
    height: paddedHeight * scale,
  };
}

/** Converte pontos projetados em um atributo `d` de <path> estável (2 casas). */
export function toPathData(points: Vec[]): string {
  if (!points.length) return '';
  const parts = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`);
  return `${parts.join(' ')} Z`;
}

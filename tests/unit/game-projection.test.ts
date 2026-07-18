import { describe, expect, it } from 'vitest';
import { createProjection, toPathData } from '../../src/domain/game/projection';
import { pointInPolygon } from '../../src/domain/game/geometry';

// Retângulo real ~ (400m x 200m) perto de -21° de latitude.
const ring = [
  { lat: -21.12, lng: -45.65 },
  { lat: -21.12, lng: -45.6462 },
  { lat: -21.1218, lng: -45.6462 },
  { lat: -21.1218, lng: -45.65 },
];

describe('createProjection', () => {
  it('largura fixa e altura proporcional à forma real (aspecto preservado)', () => {
    const projection = createProjection(ring, 1000);
    expect(projection.width).toBe(1000);
    // Terreno 2:1 (largura:altura) → altura do viewBox perto de 500, com folga do padding.
    expect(projection.height).toBeGreaterThan(350);
    expect(projection.height).toBeLessThan(650);
  });

  it('projeta todos os pontos do anel dentro do viewBox', () => {
    const projection = createProjection(ring, 1000);
    for (const point of ring) {
      const local = projection.toLocal(point);
      expect(local.x).toBeGreaterThanOrEqual(0);
      expect(local.x).toBeLessThanOrEqual(projection.width);
      expect(local.y).toBeGreaterThanOrEqual(0);
      expect(local.y).toBeLessThanOrEqual(projection.height);
    }
  });

  it('preserva a ordem/orientação: norte fica em cima (y menor)', () => {
    const projection = createProjection(ring, 1000);
    const north = projection.toLocal({ lat: -21.12, lng: -45.648 });
    const south = projection.toLocal({ lat: -21.1218, lng: -45.648 });
    expect(north.y).toBeLessThan(south.y);
  });

  it('ponto interno em lat/lng continua interno após projetar', () => {
    const projection = createProjection(ring, 1000);
    const projectedRing = ring.map(projection.toLocal);
    const inner = projection.toLocal({ lat: -21.1209, lng: -45.648 });
    expect(pointInPolygon(inner, projectedRing)).toBe(true);
  });
});

describe('toPathData', () => {
  it('gera path fechado estável com 2 casas', () => {
    expect(toPathData([{ x: 0, y: 0 }, { x: 10.123, y: 0 }, { x: 10, y: 10.567 }]))
      .toBe('M0.00,0.00 L10.12,0.00 L10.00,10.57 Z');
  });
  it('lista vazia gera path vazio', () => {
    expect(toPathData([])).toBe('');
  });
});

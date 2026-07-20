import { describe, expect, it } from 'vitest';
import { boundingBox, centroid, pointInPolygon, ringAreaHa, ringError, roundRing, shoelaceArea } from '../../src/domain/game/geometry';

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe('ringError', () => {
  it('rejeita anel com menos de 3 pontos', () => {
    expect(ringError([{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }])).toMatch(/3 pontos/);
  });
  it('rejeita coordenadas fora do mundo', () => {
    expect(ringError([{ lat: 91, lng: 0 }, { lat: 0, lng: 0 }, { lat: 1, lng: 1 }])).toMatch(/fora do mapa/);
  });
  it('rejeita ponto não numérico', () => {
    expect(ringError([{ lat: Number.NaN, lng: 0 }, { lat: 0, lng: 0 }, { lat: 1, lng: 1 }])).toMatch(/inválido/);
  });
  it('aceita triângulo válido', () => {
    expect(ringError([{ lat: -21.1, lng: -45.1 }, { lat: -21.2, lng: -45.1 }, { lat: -21.2, lng: -45.2 }])).toBeNull();
  });
});

describe('shoelaceArea e centroid', () => {
  it('área do quadrado 10x10 é 100', () => {
    expect(Math.abs(shoelaceArea(square))).toBe(100);
  });
  it('centroide do quadrado é o centro', () => {
    const center = centroid(square);
    expect(center.x).toBeCloseTo(5);
    expect(center.y).toBeCloseTo(5);
  });
  it('centroide degenerado (pontos colineares) cai na média simples', () => {
    const line = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }];
    const center = centroid(line);
    expect(center.x).toBeCloseTo(5);
    expect(center.y).toBeCloseTo(0);
  });
});

describe('ringAreaHa', () => {
  it('quadrado de ~100 m de lado no equador mede ~1 ha', () => {
    // 0.0009° de latitude ≈ 100 m; quadrado ≈ 10.000 m² = 1 ha.
    const side = 0.0009;
    const ring = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: side },
      { lat: side, lng: side },
      { lat: side, lng: 0 },
    ];
    expect(ringAreaHa(ring)).toBeCloseTo(1, 1);
  });
  it('mede o mesmo quadrado em latitude brasileira sem distorção relevante', () => {
    // Quadrado real de ~100 m de lado a -21.5°: o lado em longitude
    // precisa compensar o cos(latitude). Esperado ≈ 1 ha.
    const base = { lat: -21.5, lng: -45.5 };
    const latSide = 0.0009;
    const lngSide = latSide / Math.cos((base.lat * Math.PI) / 180);
    const ring = [
      base,
      { lat: base.lat, lng: base.lng + lngSide },
      { lat: base.lat + latSide, lng: base.lng + lngSide },
      { lat: base.lat + latSide, lng: base.lng },
    ];
    expect(ringAreaHa(ring)).toBeCloseTo(1, 1);
  });
  it('anel degenerado mede zero', () => {
    expect(ringAreaHa([{ lat: -21, lng: -45 }, { lat: -21.1, lng: -45.1 }])).toBe(0);
  });
});

describe('pointInPolygon', () => {
  it('detecta dentro e fora do quadrado', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
    expect(pointInPolygon({ x: -1, y: -1 }, square)).toBe(false);
  });
  it('funciona em polígono côncavo (L)', () => {
    const ell = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 },
      { x: 4, y: 4 }, { x: 4, y: 10 }, { x: 0, y: 10 },
    ];
    expect(pointInPolygon({ x: 2, y: 8 }, ell)).toBe(true);
    expect(pointInPolygon({ x: 8, y: 8 }, ell)).toBe(false);
  });
});

describe('roundRing (Chaikin)', () => {
  it('é determinístico e dobra os pontos por iteração', () => {
    const once = roundRing(square, 1);
    expect(once).toHaveLength(8);
    expect(roundRing(square, 2)).toHaveLength(16);
    expect(roundRing(square, 1)).toEqual(once);
  });
  it('mantém os pontos dentro da caixa original (corta cantos, não expande)', () => {
    const rounded = roundRing(square, 2);
    const box = boundingBox(rounded);
    expect(box.minX).toBeGreaterThanOrEqual(0);
    expect(box.minY).toBeGreaterThanOrEqual(0);
    expect(box.maxX).toBeLessThanOrEqual(10);
    expect(box.maxY).toBeLessThanOrEqual(10);
  });
  it('preserva área aproximada (suaviza sem colapsar)', () => {
    const rounded = roundRing(square, 2);
    expect(Math.abs(shoelaceArea(rounded))).toBeGreaterThan(80);
  });
});

import { describe, expect, it } from 'vitest';
import { CAMERA_MAX_SCALE, CAMERA_MIN_SCALE, clampCamera } from '../../src/domain/game/camera';
import { spacedPointsAlongRing, type Vec } from '../../src/domain/game/geometry';

describe('clampCamera — limites do tabuleiro', () => {
  const W = 1000;
  const H = 600;

  it('na escala 1 (enquadramento inteiro) o pan fica travado em (0,0)', () => {
    expect(clampCamera({ x: 120, y: -80, scale: 1 }, W, H)).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it('não afasta além do enquadramento nem aproxima além do máximo', () => {
    expect(clampCamera({ x: 0, y: 0, scale: 0.4 }, W, H).scale).toBe(CAMERA_MIN_SCALE);
    expect(clampCamera({ x: 0, y: 0, scale: 99 }, W, H).scale).toBe(CAMERA_MAX_SCALE);
  });

  it('ampliado, o pan alcança exatamente até as bordas do terreno', () => {
    const clamped = clampCamera({ x: -99999, y: 99999, scale: 2 }, W, H);
    // Conteúdo 2× maior: x pode ir de (W − 2W) = −1000 até 0.
    expect(clamped.x).toBe(W - W * 2);
    expect(clamped.y).toBe(0);
    const inside = clampCamera({ x: -300, y: -150, scale: 2 }, W, H);
    expect(inside).toEqual({ x: -300, y: -150, scale: 2 });
  });
});

describe('spacedPointsAlongRing — mourões da cerca', () => {
  const square: Vec[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it('emite pontos equiespaçados ao longo do contorno fechado', () => {
    const posts = spacedPointsAlongRing(square, 25);
    // Perímetro 400 / 25 = 16 vãos; o último cai sobre o inicial e é removido.
    expect(posts.length).toBe(16);
    expect(posts[0]).toEqual({ x: 0, y: 0 });
    expect(posts[1]).toEqual({ x: 25, y: 0 });
    // Todos os pontos ficam sobre o contorno (x ou y em 0/100).
    for (const post of posts) {
      const onEdge = post.x === 0 || post.x === 100 || post.y === 0 || post.y === 100;
      expect(onEdge).toBe(true);
    }
  });

  it('é determinístico e não duplica o mourão inicial', () => {
    const first = spacedPointsAlongRing(square, 40);
    const second = spacedPointsAlongRing(square, 40);
    expect(first).toEqual(second);
    const start = first[0];
    const duplicates = first.filter((post) => Math.hypot(post.x - start.x, post.y - start.y) < 1e-9);
    expect(duplicates.length).toBe(1);
  });

  it('entradas degeneradas: anel curto ou espaçamento inválido → vazio', () => {
    expect(spacedPointsAlongRing([{ x: 0, y: 0 }], 10)).toEqual([]);
    expect(spacedPointsAlongRing(square, 0)).toEqual([]);
  });
});

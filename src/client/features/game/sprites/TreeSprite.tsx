import { gameTokens } from '../tokens';

/** Árvore vista de cima: copa em dois tons, sombra sutil. Decoração pura. */
export function TreeSprite({ x, y, size = 30 }: { x: number; y: number; size?: number }) {
  const { tree, treeShade, ink } = gameTokens.colors;
  const scale = size / gameTokens.sprite.grid;
  return <g transform={`translate(${x} ${y}) scale(${scale}) translate(-32 -32)`} aria-hidden>
    <ellipse cx="35" cy="36" rx="21" ry="19" fill={ink} opacity="0.08" />
    <circle cx="32" cy="32" r="20" fill={treeShade} />
    <circle cx="28" cy="28" r="14" fill={tree} />
  </g>;
}

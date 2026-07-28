import { gameTokens } from '../tokens';

/**
 * Balança de pesagem vista de cima (grid 64): plataforma de metal sobre terra
 * batida, com os trilhos de contenção nas laterais. Multi-instância.
 */
export function BalancaSprite({ x, y, size = 64 }: { x: number; y: number; size?: number }) {
  const { dirt, steel, wood, ink } = gameTokens.colors;
  const scale = size / gameTokens.sprite.grid;
  return <g transform={`translate(${x} ${y}) scale(${scale}) translate(-32 -32)`} aria-hidden>
    <ellipse cx="32" cy="34" rx="26" ry="18" fill={dirt} opacity="0.8" />
    <rect x="16" y="20" width="32" height="26" rx="3" fill={steel} />
    <rect x="16" y="20" width="32" height="26" rx="3" fill="none" stroke={ink} strokeWidth="1.2" opacity="0.25" />
    <line x1="32" y1="20" x2="32" y2="46" stroke={ink} strokeWidth="1" opacity="0.2" />
    <g stroke={wood} strokeWidth="2.4" strokeLinecap="round">
      <line x1="12" y1="22" x2="12" y2="44" />
      <line x1="52" y1="22" x2="52" y2="44" />
    </g>
    <circle cx="32" cy="33" r="3.2" fill={ink} opacity="0.3" />
  </g>;
}

import { gameTokens } from '../tokens';

/**
 * Depósito de alimentos visto de cima (grid 64): galpão de madeira com silo ao
 * lado — a porta do inventário de alimentação. Sem accent quente (o telhado
 * `roof` fica reservado à mangueira, regra das 2 cores de destaque por cena).
 */
export function DepositoSprite({ x, y, size = 64 }: { x: number; y: number; size?: number }) {
  const { dirt, wood, steel, ink, milk } = gameTokens.colors;
  const scale = size / gameTokens.sprite.grid;
  return <g transform={`translate(${x} ${y}) scale(${scale}) translate(-32 -32)`} aria-hidden>
    <ellipse cx="32" cy="36" rx="26" ry="20" fill={dirt} opacity="0.85" />
    <g transform="rotate(6 30 32)">
      <rect x="12" y="20" width="32" height="26" rx="3" fill={wood} />
      <rect x="12" y="20" width="32" height="12" rx="3" fill="#9C825F" />
      <line x1="28" y1="20" x2="28" y2="46" stroke={ink} strokeWidth="1.2" opacity="0.3" />
    </g>
    <circle cx="50" cy="40" r="8.5" fill={steel} />
    <circle cx="50" cy="40" r="5" fill={milk} opacity="0.9" />
  </g>;
}

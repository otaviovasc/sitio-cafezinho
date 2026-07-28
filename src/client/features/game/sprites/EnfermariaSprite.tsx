import { gameTokens } from '../tokens';

/**
 * Enfermaria vista de cima (grid 64): galpão claro com a cruz no telhado —
 * o accent quente sinaliza cuidado. Multi-instância.
 */
export function EnfermariaSprite({ x, y, size = 64 }: { x: number; y: number; size?: number }) {
  const { dirt, milk, roof, ink } = gameTokens.colors;
  const scale = size / gameTokens.sprite.grid;
  return <g transform={`translate(${x} ${y}) scale(${scale}) translate(-32 -32)`} aria-hidden>
    <ellipse cx="32" cy="35" rx="25" ry="18" fill={dirt} opacity="0.7" />
    <rect x="14" y="17" width="36" height="28" rx="5" fill={milk} />
    <rect x="14" y="17" width="36" height="28" rx="5" fill="none" stroke={ink} strokeWidth="1.2" opacity="0.25" />
    <g fill={roof}>
      <rect x="28.5" y="22" width="7" height="18" rx="2" />
      <rect x="23" y="27.5" width="18" height="7" rx="2" />
    </g>
  </g>;
}

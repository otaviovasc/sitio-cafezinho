import { gameTokens } from '../tokens';

/**
 * Garagem vista de cima (grid 64): cobertura de metal com o trator aparecendo
 * na entrada. Decoração pura — sem ações no jogo.
 */
export function GaragemSprite({ x, y, size = 64 }: { x: number; y: number; size?: number }) {
  const { dirt, steel, wood, ink } = gameTokens.colors;
  const scale = size / gameTokens.sprite.grid;
  return <g transform={`translate(${x} ${y}) scale(${scale}) translate(-32 -32)`} aria-hidden>
    <ellipse cx="32" cy="38" rx="24" ry="17" fill={dirt} opacity="0.8" />
    <g transform="rotate(-6 32 30)">
      <rect x="14" y="16" width="36" height="28" rx="4" fill={steel} />
      <rect x="14" y="16" width="36" height="13" rx="4" fill="#B4C6D6" />
      <line x1="32" y1="16" x2="32" y2="44" stroke={ink} strokeWidth="1.2" opacity="0.25" />
    </g>
    <rect x="24" y="44" width="16" height="10" rx="3" fill={wood} />
    <circle cx="26.5" cy="55" r="2.6" fill={ink} opacity="0.7" />
    <circle cx="37.5" cy="55" r="2.6" fill={ink} opacity="0.7" />
  </g>;
}

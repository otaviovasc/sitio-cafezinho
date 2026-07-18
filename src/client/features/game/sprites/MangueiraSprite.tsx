import { gameTokens } from '../tokens';

/**
 * A mangueira vista de cima (grid 64): pátio de terra, galpão com telhado de
 * duas águas (o accent quente da cena) e o curral de espera. Instalação
 * principal do jogo.
 */
export function MangueiraSprite({ x, y, size = 64 }: { x: number; y: number; size?: number }) {
  const { dirt, roof, wood, ink, milk } = gameTokens.colors;
  const scale = size / gameTokens.sprite.grid;
  return <g transform={`translate(${x} ${y}) scale(${scale}) translate(-32 -32)`} aria-hidden>
    <ellipse cx="32" cy="36" rx="28" ry="22" fill={dirt} />
    <ellipse cx="32" cy="36" rx="28" ry="22" fill="none" stroke={wood} strokeWidth="1.6" strokeDasharray="5 4" />
    <g transform="rotate(-8 32 30)">
      <rect x="14" y="18" width="36" height="24" rx="3" fill={roof} />
      <rect x="14" y="18" width="36" height="11" rx="3" fill="#E3A188" />
      <line x1="14" y1="30" x2="50" y2="30" stroke={ink} strokeWidth="1.4" opacity="0.35" />
    </g>
    <circle cx="52" cy="50" r="7" fill={milk} stroke={ink} strokeWidth="1.2" opacity="0.95" />
  </g>;
}

import { gameTokens } from '../tokens';

/**
 * Porteira vista de cima (grid 64): faixa de estrada de terra com dois mourões
 * e os trilhos da porteira entre eles. É por onde tudo entra e sai do sítio.
 */
export function PorteiraSprite({ x, y, size = 64 }: { x: number; y: number; size?: number }) {
  const { dirt, wood, woodDark } = gameTokens.colors;
  const scale = size / gameTokens.sprite.grid;
  return <g transform={`translate(${x} ${y}) scale(${scale}) translate(-32 -32)`} aria-hidden>
    <rect x="10" y="24" width="44" height="16" rx="8" fill={dirt} opacity="0.85" />
    <g transform="rotate(-8 32 32)">
      <g stroke={wood} strokeWidth="2.6" strokeLinecap="round">
        <line x1="18" y1="27" x2="46" y2="27" />
        <line x1="18" y1="32" x2="46" y2="32" />
        <line x1="18" y1="37" x2="46" y2="37" />
      </g>
      <g>
        <rect x="15" y="22" width="5" height="20" rx="2" fill={woodDark} />
        <rect x="44" y="22" width="5" height="20" rx="2" fill={woodDark} />
      </g>
    </g>
  </g>;
}

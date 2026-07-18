import { gameTokens } from '../tokens';

/**
 * Vaca vista de cima (grid 64): corpo, cabeça, orelhas e manchas — flat, sem
 * contorno. `flip` espelha para o rebanho não parecer carimbado.
 */
export function CowSprite({ x, y, size = 26, flip = false }: { x: number; y: number; size?: number; flip?: boolean }) {
  const { cow, cowSpot } = gameTokens.colors;
  const scale = size / gameTokens.sprite.grid;
  return <g transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale}) translate(-32 -32)`} aria-hidden>
    <ellipse cx="32" cy="38" rx="14" ry="19" fill={cow} />
    <circle cx="32" cy="15" r="9" fill={cow} />
    <ellipse cx="24" cy="11" rx="4" ry="3" fill={cowSpot} opacity="0.85" transform="rotate(-28 24 11)" />
    <ellipse cx="40" cy="11" rx="4" ry="3" fill={cowSpot} opacity="0.85" transform="rotate(28 40 11)" />
    <ellipse cx="27" cy="32" rx="6" ry="8" fill={cowSpot} />
    <ellipse cx="38" cy="45" rx="5" ry="6.5" fill={cowSpot} />
    <path d="M32 55 Q34 60 31 62" stroke={cowSpot} strokeWidth="2" strokeLinecap="round" fill="none" />
  </g>;
}

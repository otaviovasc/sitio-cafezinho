import { gameTokens } from './tokens';

/**
 * <defs> compartilhados do mapa: gradientes do patchwork (2 stops), textura de
 * tufos de capim e a sombra única do diorama. Ids são globais no SVG do jogo.
 */
export function GameDefs() {
  const { pasture, pastureLight, meadowEdge, ink, grass, grassLight } = gameTokens.colors;
  return <defs>
    {pasture.map((color, index) => <linearGradient key={color} id={`game-pasture-${index}`} x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stopColor={pastureLight[index]} />
      <stop offset="1" stopColor={color} />
    </linearGradient>)}
    <linearGradient id="game-ground-grass" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stopColor={grassLight} />
      <stop offset="1" stopColor={grass} />
    </linearGradient>
    <pattern id="game-grass" width="46" height="46" patternUnits="userSpaceOnUse" patternTransform="rotate(8)">
      <g stroke={meadowEdge} strokeWidth="1.6" strokeLinecap="round" opacity="0.5">
        <path d="M6 12 q1 -5 2 -7 M10 12 q0 -4 -1 -6" fill="none" />
        <path d="M30 34 q1 -5 2 -7 M34 34 q0 -4 -1 -6" fill="none" />
        <path d="M38 10 q1 -4 2 -6" fill="none" />
        <path d="M14 40 q1 -4 2 -6" fill="none" />
      </g>
    </pattern>
    <filter id="game-diorama" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="7" stdDeviation="9" floodColor={ink} floodOpacity="0.22" />
    </filter>
  </defs>;
}

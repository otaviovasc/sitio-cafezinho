import { gameTokens } from '../tokens';

/**
 * Estação de alimentação vista de cima (grid 64): cocho comprido de madeira
 * com trato dentro e piso de terra batida ao redor. É onde o trato do dia é
 * registrado no jogo.
 */
export function EstacaoAlimentacaoSprite({ x, y, size = 64 }: { x: number; y: number; size?: number }) {
  const { dirt, wood, ink } = gameTokens.colors;
  const scale = size / gameTokens.sprite.grid;
  return <g transform={`translate(${x} ${y}) scale(${scale}) translate(-32 -32)`} aria-hidden>
    <ellipse cx="32" cy="34" rx="26" ry="17" fill={dirt} opacity="0.85" />
    <g transform="rotate(-4 32 32)">
      <rect x="10" y="26" width="44" height="13" rx="6" fill={wood} />
      <rect x="13" y="29" width="38" height="7" rx="3.5" fill="#C8A96B" />
      <g fill="#B08F52">
        <circle cx="20" cy="32.5" r="2.2" />
        <circle cx="30" cy="31.5" r="2.6" />
        <circle cx="40" cy="32.8" r="2.2" />
        <circle cx="47" cy="31.8" r="1.9" />
      </g>
    </g>
    <path d="M14 46 q4 3 9 3 M41 46 q4 3 9 3" stroke={ink} strokeWidth="1.4" strokeLinecap="round" fill="none" opacity="0.25" />
  </g>;
}

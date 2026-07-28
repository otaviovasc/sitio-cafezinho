import { gameTokens } from '../tokens';

/**
 * Casa do sítio vista de cima (grid 64): telhado no accent quente com a cumeeira
 * ao centro e um recorte de terreno. É o escritório — folha própria no jogo.
 */
export function CasaSprite({ x, y, size = 64 }: { x: number; y: number; size?: number }) {
  const { dirt, roof, milk, ink } = gameTokens.colors;
  const scale = size / gameTokens.sprite.grid;
  return <g transform={`translate(${x} ${y}) scale(${scale}) translate(-32 -32)`} aria-hidden>
    <ellipse cx="32" cy="36" rx="25" ry="18" fill={dirt} opacity="0.7" />
    <rect x="13" y="16" width="38" height="30" rx="5" fill={roof} />
    <rect x="13" y="16" width="38" height="30" rx="5" fill="none" stroke={ink} strokeWidth="1.2" opacity="0.2" />
    <line x1="32" y1="17" x2="32" y2="45" stroke={milk} strokeWidth="2" opacity="0.8" />
    <rect x="24" y="44" width="16" height="8" rx="3" fill={milk} />
    <rect x="29.5" y="46" width="5" height="6" rx="1.5" fill={ink} opacity="0.55" />
  </g>;
}

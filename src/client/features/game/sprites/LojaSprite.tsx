import { gameTokens } from '../tokens';

/**
 * A vendinha da Loja (grid 64): balcão de madeira com toldo listrado. Usada no
 * cabeçalho da folha da Loja e no chip do HUD — não é instalação do mapa.
 */
export function LojaSprite({ x, y, size = 64 }: { x: number; y: number; size?: number }) {
  const { wood, woodDark, roof, milk, dirt } = gameTokens.colors;
  const scale = size / gameTokens.sprite.grid;
  return <g transform={`translate(${x} ${y}) scale(${scale}) translate(-32 -32)`} aria-hidden>
    <rect x="10" y="30" width="44" height="24" rx="4" fill={wood} />
    <rect x="10" y="42" width="44" height="4" fill={woodDark} opacity="0.5" />
    <rect x="6" y="16" width="52" height="12" rx="5" fill={roof} />
    {[12, 24, 36, 48].map((stripe) => <rect key={stripe} x={stripe} y="16" width="6" height="12" fill={milk} opacity="0.85" />)}
    <path d="M6 26 h52 l-3 6 h-46 z" fill={roof} opacity="0.6" />
    <rect x="16" y="34" width="10" height="7" rx="2" fill={dirt} />
    <rect x="29" y="34" width="10" height="7" rx="2" fill={milk} />
    <rect x="42" y="34" width="8" height="7" rx="2" fill={dirt} />
  </g>;
}

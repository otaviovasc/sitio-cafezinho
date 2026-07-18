import { gameTokens } from '../tokens';

/**
 * Medidor do tanque de leite: o nível (0–1) vem do servidor e é espelhado em
 * `data-level` para asserção sem pixels. O leite sobe/desce por transform
 * escalado na base (transição CSS, desligada em prefers-reduced-motion).
 */
export function TankGauge({ x, y, level }: { x: number; y: number; level: number }) {
  const { steel, milk, ink } = gameTokens.colors;
  const clamped = Math.min(1, Math.max(0, level));
  return <g transform={`translate(${x} ${y})`} data-testid="game-tank" data-level={clamped.toFixed(2)} role="img" aria-label={`Tanque de leite: ${Math.round(clamped * 100)}% da produção de hoje`}>
    <rect x="-11" y="-24" width="22" height="48" rx="9" fill="#fffef9" stroke={steel} strokeWidth="2.5" />
    <rect x="-8" y="-21" width="16" height="42" rx="6" fill="#DDE4EA" />
    <rect
      className="game-tank-milk"
      x="-8"
      y="-21"
      width="16"
      height="42"
      rx="6"
      fill={milk}
      stroke={steel}
      strokeWidth="1.2"
      style={{ transform: `scaleY(${clamped})` }}
    />
    <rect x="-11" y="-24" width="22" height="48" rx="9" fill="none" stroke={steel} strokeWidth="2.5" />
    <g transform="translate(0 36)">
      <rect x="-17" y="-9" width="34" height="18" rx="9" fill="#fffef9" opacity="0.9" />
      <text className="game-badge-text" y="1" fill={ink}>{Math.round(clamped * 100)}%</text>
    </g>
  </g>;
}

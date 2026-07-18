import type { PlantingGrowthStage } from '../../../../domain/game/planting';
import { gameTokens } from '../tokens';

export type PlantacaoStage = 'EMPTY' | PlantingGrowthStage;

const ROWS = [22, 32, 42, 52] as const;
const COLUMNS = [14, 24, 34, 44, 54] as const;

/** Um pé da cultura, desenhado conforme o estágio do ciclo. */
function Plant({ x, y, stage }: { x: number; y: number; stage: PlantacaoStage }) {
  const { crop, cropRipe, grassLight } = gameTokens.colors;
  switch (stage) {
    case 'SPROUT':
      return <circle cx={x} cy={y} r="1.8" fill={grassLight} />;
    case 'GROWING':
      return <g>
        <line x1={x} y1={y} x2={x} y2={y - 4.5} stroke={crop} strokeWidth="1.6" strokeLinecap="round" />
        <circle cx={x} cy={y - 5} r="2" fill={crop} />
      </g>;
    case 'MATURE':
    case 'READY':
      return <g>
        <line x1={x} y1={y} x2={x} y2={y - 7} stroke={crop} strokeWidth="1.8" strokeLinecap="round" />
        <ellipse cx={x - 2.4} cy={y - 3.5} rx="2.4" ry="1.2" fill={crop} transform={`rotate(-30 ${x - 2.4} ${y - 3.5})`} />
        <ellipse cx={x + 2.4} cy={y - 4.5} rx="2.4" ry="1.2" fill={crop} transform={`rotate(30 ${x + 2.4} ${y - 4.5})`} />
        <circle cx={x} cy={y - 8} r="2.6" fill={stage === 'READY' ? cropRipe : crop} />
      </g>;
    default:
      return null;
  }
}

/**
 * O talhão da Plantação (grid 64): terra arada com sulcos e a cultura crescendo
 * por estágio (EMPTY → SPROUT → GROWING → MATURE → READY, dourado). O estágio é
 * derivado do relógio (domain/game/planting.ts); o sprite só desenha.
 */
export function PlantacaoSprite({ x, y, size = 84, stage = 'EMPTY' }: {
  x: number;
  y: number;
  size?: number;
  stage?: PlantacaoStage;
}) {
  const { dirt, wood } = gameTokens.colors;
  const scale = size / gameTokens.sprite.grid;
  return <g transform={`translate(${x} ${y}) scale(${scale}) translate(-32 -32)`} aria-hidden data-stage={stage}>
    <rect x="5" y="12" width="54" height="46" rx="7" fill={dirt} />
    {ROWS.map((rowY) => <line key={rowY} x1="10" y1={rowY + 2.5} x2="54" y2={rowY + 2.5} stroke={wood} strokeWidth="1.4" strokeLinecap="round" opacity="0.3" />)}
    {ROWS.map((rowY) => COLUMNS.map((columnX) => <Plant key={`${rowY}-${columnX}`} x={columnX + (rowY % 20 === 2 ? 3 : 0)} y={rowY} stage={stage} />))}
  </g>;
}

import { gameTokens } from './../tokens';

/**
 * Caminhão do laticínio visto de cima. Aparece dirigindo pela estrada quando
 * uma coleta é registrada (o momento-recompensa do jogo). O estado anima via
 * classe CSS; `data-state` espelha para os testes.
 */
export function TruckSprite() {
  const { steel, ink, milk, roof } = gameTokens.colors;
  return <g aria-hidden>
    <rect x="-30" y="-11" width="42" height="22" rx="6" fill={milk} stroke={steel} strokeWidth="2" />
    <ellipse cx="-9" cy="0" rx="8" ry="7" fill={steel} opacity="0.55" />
    <rect x="14" y="-9" width="16" height="18" rx="4" fill={roof} />
    <rect x="26" y="-7" width="4" height="14" rx="2" fill={ink} opacity="0.4" />
  </g>;
}

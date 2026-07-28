import { useMemo, type ReactNode } from 'react';
import { createProjection } from '../../../domain/game/projection';
import type { GameState } from '../../../domain/game/state';
import { GameDefs } from './GameDefs';
import { HerdLayer } from './layers/HerdLayer';
import { ZoneLayer } from './layers/ZoneLayer';
import { gameTokens } from './tokens';
import { useMapCamera } from './useMapCamera';

/**
 * O tabuleiro: SVG com viewBox derivado do perímetro real, câmera pan/zoom num
 * único <g> e camadas puras por cima. `children` recebe a projeção para
 * camadas extras (instalações, feedbacks) sem acoplar este componente.
 */
export function GameMap({ state, onSelectGroup, onSelectPlot, onSelectPasture, children }: {
  state: GameState;
  onSelectGroup?: Parameters<typeof HerdLayer>[0]['onSelect'];
  /** Toque num talhão (zona PLOT) — abre a folha do ciclo de plantio. */
  onSelectPlot?: (zone: GameState['map']['zones'][number]) => void;
  /** Toque na área vazia de um pasto — abre a folha do pasto. */
  onSelectPasture?: (zone: GameState['map']['zones'][number]) => void;
  children?: (projection: ReturnType<typeof createProjection>) => ReactNode;
}) {
  const perimeter = state.map.zones.find((zone) => zone.kind === 'PERIMETER');
  const projection = useMemo(
    () => (perimeter ? createProjection(perimeter.ring, gameTokens.viewBoxWidth) : null),
    [perimeter],
  );
  const camera = useMapCamera(projection?.width ?? gameTokens.viewBoxWidth, projection?.height ?? gameTokens.viewBoxWidth);
  if (!projection) return null;

  return <div className="relative h-full w-full">
    <svg
      className="game-map"
      viewBox={`0 0 ${projection.width} ${projection.height.toFixed(2)}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Mapa do sítio"
      {...camera.handlers}
    >
      <GameDefs />
      <g data-testid="game-camera" transform={camera.transform}>
        <ZoneLayer zones={state.map.zones} projection={projection} plantings={state.plantings} onSelectPlot={onSelectPlot} onSelectPasture={onSelectPasture} />
        <HerdLayer herd={state.herd} zones={state.map.zones} projection={projection} onSelect={onSelectGroup} />
        {children?.(projection)}
      </g>
    </svg>
    <div className="game-zoom-controls">
      <button type="button" className="game-zoom-button" aria-label="Aproximar" onClick={camera.zoomIn}>+</button>
      <button type="button" className="game-zoom-button" aria-label="Afastar" onClick={camera.zoomOut}>−</button>
      <button type="button" className="game-zoom-button" aria-label="Centralizar" onClick={camera.reset}>⌂</button>
    </div>
  </div>;
}

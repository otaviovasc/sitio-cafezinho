import { useMemo, type KeyboardEvent } from 'react';
import { centroid, pointInPolygon, spacedPointsAlongRing } from '../../../../domain/game/geometry';
import { herdClusterLayout } from '../../../../domain/game/herd-layout';
import { toPathData, type GameProjection } from '../../../../domain/game/projection';
import type { GameMapZone, GamePlanting } from '../../../../domain/game/state';
import { TreeSprite } from '../sprites/TreeSprite';
import { gameTokens } from '../tokens';

/**
 * Perímetro (diorama gramado com cerca de mourões) + pastos cercados +
 * talhões (zonas PLOT, terra de roça). O chão INTEIRO do sítio é grama
 * (gradiente `game-ground-grass` + tufos) — os pastos são recortes do mesmo
 * capim em tons do patchwork. Perímetro e pastos seguem EXATAMENTE os pontos
 * traçados no editor (decisão do usuário: sem arredondar). Os talhões tingem
 * pelo estágio do plantio (derivado do relógio) e ficam dourados quando
 * prontos; tocar num talhão abre a folha do ciclo. Árvores decorativas nascem
 * deterministicamente no chão livre (fora de pastos e talhões).
 */
export function ZoneLayer({ zones, projection, plantings = [], onSelectPlot, onSelectPasture }: {
  zones: GameMapZone[];
  projection: GameProjection;
  /** Ciclos ativos por talhão (tinge o PLOT e acende o selo "Colher!"). */
  plantings?: GamePlanting[];
  onSelectPlot?: (zone: GameMapZone) => void;
  /** Toque na área vazia de um pasto — abre a folha do pasto (o toque no rebanho abre a folha do lote). */
  onSelectPasture?: (zone: GameMapZone) => void;
}) {
  const { colors } = gameTokens;
  const perimeter = zones.find((zone) => zone.kind === 'PERIMETER') ?? null;
  const pastures = useMemo(() => zones.filter((zone) => zone.kind === 'PASTURE'), [zones]);
  const plots = useMemo(() => zones.filter((zone) => zone.kind === 'PLOT'), [zones]);
  const plantingByZone = useMemo(() => new Map(plantings.map((planting) => [planting.zoneId, planting])), [plantings]);

  const perimeterProjected = useMemo(
    () => (perimeter ? perimeter.ring.map(projection.toLocal) : []),
    [perimeter, projection],
  );
  // Perímetro NÃO passa por suavização: o polígono renderizado é exatamente o
  // que foi traçado no editor. Os mourões seguem o mesmo contorno exato.
  const perimeterPath = useMemo(
    () => (perimeterProjected.length ? toPathData(perimeterProjected) : ''),
    [perimeterProjected],
  );
  const fencePosts = useMemo(
    () => spacedPointsAlongRing(perimeterProjected, gameTokens.fence.postSpacing),
    [perimeterProjected],
  );
  // Pastos idem: o polígono renderizado é exatamente o que foi traçado no
  // editor. Os mourões seguem o mesmo contorno exato.
  const pastureShapes = useMemo(() => pastures.map((zone) => {
    const projected = zone.ring.map(projection.toLocal);
    return {
      zone,
      projected,
      path: toPathData(projected),
      label: centroid(projected),
      posts: spacedPointsAlongRing(projected, gameTokens.fence.pasturePostSpacing),
    };
  }), [pastures, projection]);

  const plotShapes = useMemo(() => plots.map((zone) => {
    const projected = zone.ring.map(projection.toLocal);
    const planting = plantingByZone.get(zone.id) ?? null;
    return { zone, projected, path: toPathData(projected), label: centroid(projected), planting };
  }), [plots, plantingByZone, projection]);

  // Árvores decorativas: determinísticas, no chão do sítio e fora das áreas.
  const trees = useMemo(() => {
    if (!perimeterProjected.length) return [];
    const busy = [...pastureShapes, ...plotShapes];
    return herdClusterLayout(perimeterProjected, 7, 'game-trees', 7)
      .filter((point) => !busy.some((shape) => pointInPolygon(point, shape.projected)));
  }, [perimeterProjected, pastureShapes, plotShapes]);

  function activatePlot(event: KeyboardEvent, zone: GameMapZone) {
    if (!onSelectPlot) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelectPlot(zone);
    }
  }

  function activatePasture(event: KeyboardEvent, zone: GameMapZone) {
    if (!onSelectPasture) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelectPasture(zone);
    }
  }

  if (!perimeter) return null;
  return <g>
    <g filter="url(#game-diorama)">
      <path d={perimeterPath} fill="url(#game-ground-grass)" data-testid={`game-zone-${perimeter.id}`} role="img" aria-label={`Perímetro: ${perimeter.name}`} />
    </g>
    <path d={perimeterPath} fill="url(#game-grass)" pointerEvents="none" />
    {/* Cerca do perímetro: faixa de terra batida + dois trilhos + mourões. */}
    <g data-testid="game-fence" data-post-count={fencePosts.length} pointerEvents="none">
      <path d={perimeterPath} fill="none" stroke={colors.dirt} strokeWidth="7" strokeLinejoin="round" opacity="0.7" />
      <path d={perimeterPath} fill="none" stroke={colors.wood} strokeWidth="1.7" strokeLinejoin="round" opacity="0.9" />
      <path d={perimeterPath} fill="none" stroke={colors.wood} strokeWidth="1.2" strokeDasharray="9 7" strokeLinejoin="round" opacity="0.65" />
      {fencePosts.map((post, index) => <g key={index} transform={`translate(${post.x.toFixed(2)} ${post.y.toFixed(2)})`}>
        <circle r={gameTokens.fence.postRadius} fill={colors.wood} />
        <circle r={gameTokens.fence.postRadius * 0.45} fill={colors.woodDark} />
      </g>)}
    </g>
    {pastureShapes.map(({ zone, path, label, posts }) => <g
      key={zone.id}
      role="button"
      tabIndex={0}
      aria-label={`Pasto: ${zone.name} — abrir a folha do pasto`}
      className="game-installation"
      onClick={() => onSelectPasture?.(zone)}
      onKeyDown={(event) => activatePasture(event, zone)}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <path
        d={path}
        fill={`url(#game-pasture-${zone.styleVariant % colors.pasture.length})`}
        data-testid={`game-zone-${zone.id}`}
      />
      <path d={path} fill="url(#game-grass)" pointerEvents="none" />
      {/* A mesma cerca do sítio, em madeira mais clara, sobre o traçado exato. */}
      <g data-testid={`game-fence-pasture-${zone.id}`} data-post-count={posts.length} pointerEvents="none">
        <path d={path} fill="none" stroke={colors.woodLight} strokeWidth="1.4" strokeLinejoin="round" opacity="0.95" />
        <path d={path} fill="none" stroke={colors.woodLight} strokeWidth="1" strokeDasharray="8 6" strokeLinejoin="round" opacity="0.6" />
        {posts.map((post, index) => <g key={index} transform={`translate(${post.x.toFixed(2)} ${post.y.toFixed(2)})`}>
          <circle r={gameTokens.fence.pasturePostRadius} fill={colors.woodLight} />
          <circle r={gameTokens.fence.pasturePostRadius * 0.45} fill={colors.woodLightDark} />
        </g>)}
      </g>
      <text className="game-zone-label" x={label.x} y={label.y} data-testid={`game-zone-label-${zone.id}`}>{zone.name}</text>
    </g>)}
    {plotShapes.map(({ zone, path, label, planting }) => {
      const stage = planting?.stage ?? 'EMPTY';
      const fill = stage === 'READY' ? colors.cropRipe : stage === 'EMPTY' ? colors.dirt : colors.crop;
      const opacity = stage === 'READY' ? 0.85 : stage === 'EMPTY' ? 0.4 : 0.55;
      return <g
        key={zone.id}
        role="button"
        tabIndex={0}
        aria-label={`Talhão: ${zone.name} — abrir o ciclo de plantio`}
        className="game-installation"
        onClick={() => onSelectPlot?.(zone)}
        onKeyDown={(event) => activatePlot(event, zone)}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <path
          d={path}
          fill={fill}
          opacity={opacity}
          data-testid={`game-zone-${zone.id}`}
        />
        <path d={path} fill="none" stroke={colors.crop} strokeWidth="1.6" strokeDasharray="6 5" strokeLinejoin="round" opacity="0.8" pointerEvents="none" />
        <text className="game-zone-label" x={label.x} y={label.y} data-testid={`game-zone-label-${zone.id}`} pointerEvents="none">{zone.name}</text>
        {stage === 'READY' && <g className="game-ready-badge" transform={`translate(${label.x} ${label.y - 26})`} data-testid={`game-plot-ready-${zone.id}`} pointerEvents="none">
          <rect x="-32" y="-13" width="64" height="26" rx="13" fill={colors.milk} stroke={colors.cropRipe} strokeWidth="1.5" />
          <text className="game-badge-text" y="1">Colher! 🌾</text>
        </g>}
      </g>;
    })}
    {trees.map((point, index) => <TreeSprite key={index} x={point.x} y={point.y} size={index % 2 === 0 ? 34 : 26} />)}
  </g>;
}

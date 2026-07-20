import { useMemo } from 'react';
import { centroid, pointInPolygon, spacedPointsAlongRing } from '../../../../domain/game/geometry';
import { herdClusterLayout } from '../../../../domain/game/herd-layout';
import { toPathData, type GameProjection } from '../../../../domain/game/projection';
import type { GameMapZone } from '../../../../domain/game/state';
import { TreeSprite } from '../sprites/TreeSprite';
import { gameTokens } from '../tokens';

/**
 * Perímetro (diorama gramado com cerca de mourões) + pastos cercados. O chão
 * INTEIRO do sítio é grama (gradiente `game-ground-grass` + tufos) — os pastos
 * são recortes do mesmo capim em tons do patchwork. Perímetro e pastos seguem
 * EXATAMENTE os pontos traçados no editor (decisão do usuário: sem arredondar)
 * — o que a pessoa marcou no satélite é o que aparece no jogo. Os pastos
 * recebem a mesma cerca do sítio em madeira mais clara. Árvores decorativas
 * nascem deterministicamente no chão livre.
 */
export function ZoneLayer({ zones, projection }: { zones: GameMapZone[]; projection: GameProjection }) {
  const { colors } = gameTokens;
  const perimeter = zones.find((zone) => zone.kind === 'PERIMETER') ?? null;
  const pastures = useMemo(() => zones.filter((zone) => zone.kind === 'PASTURE'), [zones]);

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

  // Árvores decorativas: determinísticas, no chão do sítio e fora dos pastos.
  const trees = useMemo(() => {
    if (!perimeterProjected.length) return [];
    return herdClusterLayout(perimeterProjected, 7, 'game-trees', 7)
      .filter((point) => !pastureShapes.some((shape) => pointInPolygon(point, shape.projected)));
  }, [perimeterProjected, pastureShapes]);

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
    {pastureShapes.map(({ zone, path, label, posts }) => <g key={zone.id}>
      <path
        d={path}
        fill={`url(#game-pasture-${zone.styleVariant % colors.pasture.length})`}
        data-testid={`game-zone-${zone.id}`}
        role="img"
        aria-label={`Pasto: ${zone.name}`}
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
    {trees.map((point, index) => <TreeSprite key={index} x={point.x} y={point.y} size={index % 2 === 0 ? 34 : 26} />)}
  </g>;
}

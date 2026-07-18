import { useMemo, type CSSProperties, type KeyboardEvent } from 'react';
import { centroid, boundingBox } from '../../../../domain/game/geometry';
import { herdClusterLayout, herdGrazeMotion } from '../../../../domain/game/herd-layout';
import type { GameProjection } from '../../../../domain/game/projection';
import type { GameHerdGroup, GameMapZone } from '../../../../domain/game/state';
import { CowSprite } from '../sprites/CowSprite';
import { gameTokens } from '../tokens';

/**
 * Rebanho por pasto: até `herdClusterCap` vacas posicionadas
 * deterministicamente (seed = id do lote) + badge com a contagem real. Nós no
 * DOM crescem com o número de pastos, não de animais. Cada cluster é um botão
 * SVG de verdade (Enter/Espaço abrem a folha do lote); o onPointerDown para a
 * propagação para o pan da câmera não roubar o clique.
 */
export function HerdLayer({ herd, zones, projection, onSelect }: {
  herd: GameHerdGroup[];
  zones: GameMapZone[];
  projection: GameProjection;
  onSelect?: (group: GameHerdGroup) => void;
}) {
  const { colors, herdClusterCap, motion } = gameTokens;
  const clusters = useMemo(() => {
    const zoneById = new Map(zones.map((zone) => [zone.id, zone]));
    return herd
      .filter((entry) => entry.zoneId && entry.animalCount > 0)
      .flatMap((entry) => {
        const zone = zoneById.get(entry.zoneId!);
        if (!zone) return [];
        const projected = zone.ring.map(projection.toLocal);
        const positions = herdClusterLayout(projected, entry.animalCount, entry.groupId, herdClusterCap);
        const graze = herdGrazeMotion(entry.groupId, positions.length, 12, motion.grazeMinMs, motion.grazeMaxMs);
        const box = boundingBox(projected);
        const badgeAnchor = { x: centroid(projected).x, y: box.minY + 14 };
        // Hit-area só sobre o miolo do rebanho (não o pasto todo): o clique nos
        // vãos entre as vacas não pode vazar para o pasto, e o resto do pasto
        // continua livre para o pan da câmera.
        const herdBox = boundingBox(positions);
        const hitArea = {
          x: herdBox.minX - 18,
          y: herdBox.minY - 18,
          width: herdBox.maxX - herdBox.minX + 36,
          height: herdBox.maxY - herdBox.minY + 36,
        };
        return [{ entry, positions, graze, badgeAnchor, hitArea }];
      });
  }, [herd, zones, projection, herdClusterCap, motion]);

  function activate(event: KeyboardEvent, entry: GameHerdGroup) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect?.(entry);
    }
  }

  return <g>
    {clusters.map(({ entry, positions, graze, badgeAnchor, hitArea }) => <g
      key={entry.groupId}
      data-testid={`herd-cluster-${entry.groupId}`}
      role="button"
      tabIndex={0}
      aria-label={`${entry.groupName}: ${entry.animalCount} animais — abrir folha do lote`}
      className="game-installation"
      onClick={() => onSelect?.(entry)}
      onKeyDown={(event) => activate(event, entry)}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <rect x={hitArea.x} y={hitArea.y} width={hitArea.width} height={hitArea.height} rx="18" fill="transparent" />
      {positions.map((point, index) => {
        const motionVars = graze[index];
        return <g
          key={index}
          className="game-cow"
          data-grazing
          style={{
            '--cow-dx': `${motionVars.dx}px`,
            '--cow-dy': `${motionVars.dy}px`,
            '--cow-dur': `${motionVars.durationMs}ms`,
            '--cow-delay': `${motionVars.delayMs}ms`,
          } as CSSProperties}
        >
          <CowSprite x={point.x} y={point.y} size={24} flip={index % 2 === 1} />
        </g>;
      })}
      <g data-testid={`herd-count-${entry.groupId}`} transform={`translate(${badgeAnchor.x} ${badgeAnchor.y})`}>
        <rect x="-26" y="-12" width="52" height="24" rx="12" fill="#fffef9" stroke={colors.meadowEdge} strokeWidth="1" />
        <text className="game-badge-text" y="1">{entry.animalCount} 🐄</text>
      </g>
    </g>)}
  </g>;
}

import type { KeyboardEvent } from 'react';
import { centroid } from '../../../../domain/game/geometry';
import type { GameProjection } from '../../../../domain/game/projection';
import type { GameMapInstallation, GameMapZone, GameMarker } from '../../../../domain/game/state';

/**
 * Marcadores no mundo (fase 2): pendências derivadas de /api/game/state —
 * nada é armazenado. Cada marcador mora numa instalação (porteira, casa) ou
 * numa zona (talhão) e mostra SEMPRE a regra que o gerou. Tocar abre a folha
 * correspondente (quem decide é a GamePage).
 */
export function MarkerLayer({ markers, zones, installations, projection, onSelect }: {
  markers: GameMarker[];
  zones: GameMapZone[];
  installations: GameMapInstallation[];
  projection: GameProjection;
  onSelect: (marker: GameMarker) => void;
}) {
  function pointFor(marker: GameMarker): { x: number; y: number } | null {
    if (marker.targetType === 'installation') {
      const installation = installations.find((item) => item.id === marker.targetId);
      return installation ? projection.toLocal(installation.position) : null;
    }
    const zone = zones.find((item) => item.id === marker.targetId);
    return zone ? centroid(zone.ring.map(projection.toLocal)) : null;
  }

  function activate(event: KeyboardEvent, marker: GameMarker) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(marker);
    }
  }

  return <g>
    {markers.map((marker) => {
      const point = pointFor(marker);
      if (!point) return null;
      // Pill acima do alvo: largura estimada pelo texto mais longo.
      const width = Math.max(marker.label.length, marker.rule.length) * 5.4 + 22;
      const top = point.y - 74;
      return <g
        key={`${marker.kind}-${marker.targetId}`}
        data-testid={`game-marker-${marker.kind.toLowerCase().replaceAll('_', '-')}`}
        role="button"
        tabIndex={0}
        aria-label={`${marker.label} — ${marker.rule}`}
        className="game-marker"
        transform={`translate(${point.x.toFixed(1)} ${top.toFixed(1)})`}
        onClick={() => onSelect(marker)}
        onKeyDown={(event) => activate(event, marker)}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <rect x={(-width / 2).toFixed(1)} y="-17" width={width.toFixed(1)} height="34" rx="12" className="game-marker-pill" />
        <text className="game-marker-label" y="-3">{marker.label}</text>
        <text className="game-marker-rule" y="10">{marker.rule}</text>
        <path d="M -5 17 L 0 24 L 5 17 Z" className="game-marker-pill" />
      </g>;
    })}
  </g>;
}

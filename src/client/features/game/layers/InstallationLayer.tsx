import type { KeyboardEvent } from 'react';
import type { GameProjection } from '../../../../domain/game/projection';
import type { GameMapInstallation } from '../../../../domain/game/state';
import { DepositoSprite } from '../sprites/DepositoSprite';
import { EstacaoAlimentacaoSprite } from '../sprites/EstacaoAlimentacaoSprite';
import { GaragemSprite } from '../sprites/GaragemSprite';
import { MangueiraSprite } from '../sprites/MangueiraSprite';
import { TankGauge } from '../sprites/TankGauge';
import { TruckSprite } from '../sprites/TruckSprite';

export type TruckState = 'idle' | 'driving';

/** Instalações com folha de ações; GARAGEM e CASA são decorativas. */
const ACTIONABLE_KINDS = new Set(['MANGUEIRA', 'DEPOSITO', 'ESTACAO_ALIMENTACAO']);

/**
 * Instalações do tabuleiro. As que têm ações são botões SVG de verdade
 * (Enter/Espaço funcionam) com hit-area generosa; as decorativas são só
 * sprite. O caminhão do laticínio atravessa a base do mapa quando
 * `truckState` vira "driving".
 */
export function InstallationLayer({ installations, projection, tankLevel, truckState, onTruckDone, onSelect }: {
  installations: GameMapInstallation[];
  projection: GameProjection;
  tankLevel: number;
  truckState: TruckState;
  onTruckDone: () => void;
  onSelect: (installation: GameMapInstallation) => void;
}) {
  function activate(event: KeyboardEvent, installation: GameMapInstallation) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(installation);
    }
  }

  function sprite(installation: GameMapInstallation, point: { x: number; y: number }) {
    switch (installation.kind) {
      case 'MANGUEIRA':
        return <>
          <MangueiraSprite x={point.x} y={point.y} size={96} />
          <TankGauge x={point.x + 66} y={point.y - 14} level={tankLevel} />
        </>;
      case 'DEPOSITO':
        return <DepositoSprite x={point.x} y={point.y} size={84} />;
      case 'ESTACAO_ALIMENTACAO':
        return <EstacaoAlimentacaoSprite x={point.x} y={point.y} size={84} />;
      case 'GARAGEM':
        return <GaragemSprite x={point.x} y={point.y} size={80} />;
      default:
        return null;
    }
  }

  const roadY = projection.height - 26;
  return <g>
    {installations.map((installation) => {
      const point = projection.toLocal(installation.position);
      const content = sprite(installation, point);
      if (!content) return null;
      if (!ACTIONABLE_KINDS.has(installation.kind)) {
        return <g key={installation.id} data-testid={`game-installation-${installation.kind.toLowerCase()}`} role="img" aria-label={installation.name}>
          {content}
        </g>;
      }
      return <g
        key={installation.id}
        data-testid={`game-installation-${installation.kind.toLowerCase()}`}
        role="button"
        tabIndex={0}
        aria-label={`${installation.name} — abrir ações`}
        className="game-installation"
        onClick={() => onSelect(installation)}
        onKeyDown={(event) => activate(event, installation)}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <circle cx={point.x} cy={point.y} r="52" fill="transparent" />
        {content}
      </g>;
    })}
    <g
      data-testid="game-truck"
      data-state={truckState}
      transform={`translate(0 ${roadY.toFixed(0)})`}
      style={{ opacity: truckState === 'driving' ? 1 : 0 }}
      aria-hidden
    >
      <g
        className={truckState === 'driving' ? 'game-truck-driving' : undefined}
        style={{ ['--game-truck-distance' as string]: `${(projection.width + 300).toFixed(0)}px` }}
        onAnimationEnd={onTruckDone}
      >
        <TruckSprite />
      </g>
    </g>
  </g>;
}

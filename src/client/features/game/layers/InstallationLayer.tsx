import type { KeyboardEvent } from 'react';
import type { GameProjection } from '../../../../domain/game/projection';
import type { GameMapInstallation } from '../../../../domain/game/state';
import { INSTALLATION_REGISTRY } from '../installations.registry';
import { TankGauge } from '../sprites/TankGauge';
import { TruckSprite } from '../sprites/TruckSprite';

export type TruckState = 'idle' | 'driving';

/**
 * Instalações do tabuleiro, dirigidas pelo INSTALLATION_REGISTRY (sem switch
 * por kind): cada kind declara sprite, tamanho e se é acionável. As acionáveis
 * são botões SVG de verdade (Enter/Espaço funcionam) com hit-area generosa;
 * multi-instância exibe o `name` como rótulo. O caminhão do laticínio entra e
 * sai PELA PORTEIRA quando ela existe no mapa (senão, atravessa a base).
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

  // A rota do caminhão passa pela porteira (ela é a entrada/saída do sítio).
  const porteira = installations.find((installation) => installation.kind === 'PORTEIRA') ?? null;
  const roadY = porteira ? projection.toLocal(porteira.position).y : projection.height - 26;

  return <g>
    {installations.map((installation) => {
      const entry = INSTALLATION_REGISTRY[installation.kind];
      if (!entry) return null;
      const point = projection.toLocal(installation.position);
      const Sprite = entry.sprite;
      const content = <>
        <Sprite x={point.x} y={point.y} size={entry.spriteSize} />
        {entry.withTank && <TankGauge x={point.x + 66} y={point.y - 14} level={tankLevel} />}
        {entry.multiInstance && <text className="game-installation-label" x={point.x} y={point.y + entry.spriteSize / 2 + 12}>{installation.name}</text>}
      </>;
      if (!entry.actionable) {
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

import type { ReactNode } from 'react';
import { StatusBadge } from '../../components/ui';
import type { StatusDescriptor } from '../../lib/status';
import { GameSheet } from './GameSheet';

/** Ação-cartão do topo de uma folha de entidade (ícone + rótulo forte + dica). */
export type GameEntityAction = {
  icon: ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  testid?: string;
};

/**
 * Fileira de ações-cartão no estilo .game-sheet-action. Exportada à parte para
 * ser reutilizada em detalhes dentro de outras folhas (ex.: Caderno).
 */
export function GameEntityActions({ actions, testid }: { actions: GameEntityAction[]; testid?: string }) {
  if (!actions.length) return null;
  return <div className="grid gap-2" data-testid={testid}>
    {actions.map((action) => <button key={action.label} type="button" className="game-sheet-action" data-testid={action.testid} onClick={action.onClick}>
      {action.icon}
      <span><strong>{action.label}</strong>{action.hint && <small>{action.hint}</small>}</span>
    </button>)}
  </div>;
}

/**
 * Scaffold padrão de entidade do jogo, sobre o GameSheet: moldura + cabeçalho
 * (sprite, título, subtítulo) + badge de situação opcional + AÇÕES SEMPRE EM
 * CIMA (convenção do game-design), com as seções de detalhe em `children`.
 *
 * NÃO é uma máquina de estado view/edit/create: quem usa controla as próprias
 * sub-views (como a GameGroupSheet faz com 'menu'|'heat'|'status'); o scaffold
 * só padroniza a moldura comum. O data-testid da área de ações é
 * `${testid}-actions` por padrão (sobrescreva com `actionsTestid` quando um
 * testid legado precisar ser preservado).
 */
export function GameEntitySheet({ open, label, testid = 'game-entity-sheet', actionsTestid, sprite, title, subtitle, badge, actions, onClose, children }: {
  open: boolean;
  label: string;
  testid?: string;
  actionsTestid?: string;
  /** Sprite do cabeçalho, já dentro de um viewBox 0 0 64 64. */
  sprite: ReactNode;
  title: string;
  subtitle?: string;
  /** Badge de situação (descritor de lib/status.ts), ao lado do cabeçalho. */
  badge?: StatusDescriptor;
  /** Ações do topo do corpo — sempre acima das seções de detalhe. */
  actions?: GameEntityAction[];
  onClose: () => void;
  children: ReactNode;
}) {
  return <GameSheet open={open} label={label} testid={testid} sprite={sprite} title={title} subtitle={subtitle} badge={badge ? <StatusBadge descriptor={badge} /> : undefined} onClose={onClose}>
    <div className="game-sheet-body">
      {actions && actions.length > 0 && <div className="mb-3"><GameEntityActions actions={actions} testid={actionsTestid ?? `${testid}-actions`} /></div>}
      {children}
    </div>
  </GameSheet>;
}

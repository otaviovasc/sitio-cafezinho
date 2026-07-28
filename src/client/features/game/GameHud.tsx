import { Link } from 'react-router-dom';
import { BookOpen, ClipboardList, Flame, Plus } from 'lucide-react';
import { formatLiters } from '../../../domain/format';
import type { GameState } from '../../../domain/game/state';

const currency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

function monthLabel(month: string) {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' });
}

/**
 * HUD do jogo: chips flutuantes ambientados no tabuleiro (nunca painel opaco).
 * Economia real embaixo à esquerda; streak de registro em cima à direita;
 * Caderno e criação global dão acesso às listas e aos registros do sítio.
 * Valores sempre derivados do servidor — o HUD só exibe.
 */
export function GameHud({ state, pendingCount, onOpenNotebook, onOpenPending, onOpenCreate }: {
  state: GameState;
  /** Ações aguardando revisão em /api/captures (mesma contagem da aba Pendências). */
  pendingCount: number;
  onOpenNotebook: () => void;
  onOpenPending: () => void;
  onOpenCreate: () => void;
}) {
  const { economy, streaks } = state;
  return <>
    <div className="game-hud-chip game-hud-bottom-left" data-testid="hud-economy">
      {economy.milkRevenue === null
        ? <span className="flex items-center gap-1.5">
          <small>{monthLabel(economy.month)}</small>{formatLiters(economy.milkLiters)} entregues ·
          <Link className="underline" to="/financeiro/preco-leite">Cadastre o preço do leite</Link>
        </span>
        : <span className="flex items-center gap-1.5" title={`Leite: ${currency(economy.milkRevenue)} − compras: ${currency(economy.purchasesTotal)}`}>
          <small>{monthLabel(economy.month)}</small>
          {formatLiters(economy.milkLiters)} · {currency(economy.result ?? 0)}
        </span>}
    </div>
    <div className="game-hud-chip game-hud-top-right" data-testid="hud-streak" title="Dias seguidos com a produção do dia registrada">
      <Flame size={16} aria-hidden className="text-[var(--game-roof)]" />
      {streaks.dailyMilk.current === 0
        ? <span>Registre hoje para começar a sequência</span>
        : <span>{streaks.dailyMilk.current} {streaks.dailyMilk.current === 1 ? 'dia seguido' : 'dias seguidos'}</span>}
    </div>
    <button type="button" className="game-hud-chip game-hud-bottom-left-raised-2" data-testid="hud-caderno" aria-label="Abrir o Caderno do sítio" onClick={onOpenNotebook}>
      <BookOpen size={15} aria-hidden />Caderno
    </button>
    {pendingCount > 0 && <button type="button" className="game-hud-chip game-hud-pending" data-testid="hud-pending" aria-label={`${pendingCount} ações aguardando revisão`} onClick={onOpenPending}>
      <ClipboardList size={15} aria-hidden /><small>Pendências</small>{pendingCount}
    </button>}
    <div className="game-hud-create">
      <button type="button" className="game-zoom-button" data-testid="game-create-menu" aria-label="Registrar algo novo no sítio" onClick={onOpenCreate}>
        <Plus size={20} aria-hidden />
      </button>
    </div>
  </>;
}

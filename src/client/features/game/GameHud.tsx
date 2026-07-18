import { Link } from 'react-router-dom';
import { Flame } from 'lucide-react';
import { formatLiters } from '../../../domain/format';
import type { GameState } from '../../../domain/game/state';

const currency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

function monthLabel(month: string) {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' });
}

/**
 * HUD do jogo: chips flutuantes ambientados no tabuleiro (nunca painel opaco).
 * Economia real embaixo à esquerda; streak de registro em cima à direita.
 * Valores sempre derivados do servidor — o HUD só exibe.
 */
export function GameHud({ state }: { state: GameState }) {
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
  </>;
}

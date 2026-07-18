import { FeedingEventForm } from '../feeding/FeedingEventForm';
import { GameSheet } from './GameSheet';
import { EstacaoAlimentacaoSprite } from './sprites/EstacaoAlimentacaoSprite';

/**
 * Folha da Estação de Alimentação: registrar o trato dado no cocho (contexto
 * STATION), com o saldo derivado de cada item visível linha a linha. Grava o
 * fato real em /api/feeding-events.
 */
export function GameEstacaoSheet({ open, onClose, onRegistered }: {
  open: boolean;
  onClose: () => void;
  onRegistered: () => void;
}) {
  if (!open) return null;
  return <GameSheet open={open} label="Estação de alimentação" testid="game-estacao-sheet" title="Estação de alimentação" subtitle="Registrar o trato dado no cocho." onClose={onClose} sprite={<EstacaoAlimentacaoSprite x={32} y={32} size={64} />}>
    <div className="game-sheet-body">
      <FeedingEventForm context="STATION" onSaved={onRegistered} />
    </div>
  </GameSheet>;
}

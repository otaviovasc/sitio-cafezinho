import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, HeartPulse, NotebookPen, RefreshCw } from 'lucide-react';
import type { AnimalStatus } from '../../../domain/animal-lifecycle';
import { allowedNextStatuses } from '../../../domain/animal-lifecycle';
import type { GameHerdGroup, GameMapZone } from '../../../domain/game/state';
import { AnimalStatusChangeForm } from '../animals/AnimalStatusChangeForm';
import { ReproductiveEventForm } from '../animals/ReproductiveEventForm';
import { StatusBadge } from '../../components/ui';
import { animalStatusDescriptor } from '../../lib/status';
import { useResource } from '../../hooks/useResource';
import { GameSheet } from './GameSheet';
import { CowSprite } from './sprites/CowSprite';

type SheetAnimal = {
  id: string;
  name: string | null;
  tagNumber: string | null;
  status: AnimalStatus;
  currentGroup: { id: string } | null;
};

type AnimalView = 'menu' | 'heat' | 'status';

function displayName(animal: Pick<SheetAnimal, 'name' | 'tagNumber'>) {
  return animal.name || `Brinco ${animal.tagNumber}`;
}

/**
 * Folha do LOTE: abre ao tocar no rebanho pastando no tabuleiro. Cabeçalho com
 * lote, pasto e contagem real; lista de animais com ações rápidas que gravam
 * fatos reais (cio → /reproductive-events, situação → /status-changes) e link
 * para a ficha completa. Mesma pele .game-sheet das outras instalações.
 */
export function GameGroupSheet({ group, zone, onClose, onChanged }: {
  group: GameHerdGroup | null;
  zone: GameMapZone | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const open = group !== null;
  const { data: animals, reload } = useResource<SheetAnimal[]>('/api/animals');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<AnimalView>('menu');

  useEffect(() => {
    if (open) {
      setSelectedId(null);
      setView('menu');
    }
  }, [open, group?.groupId]);

  if (!group) return null;
  const members = (animals ?? []).filter((animal) => animal.currentGroup?.id === group.groupId);
  const selected = members.find((animal) => animal.id === selectedId) ?? null;
  const subtitle = `${zone ? `Pasto: ${zone.name} · ` : ''}${group.animalCount} ${group.animalCount === 1 ? 'animal' : 'animais'}`;

  function backToList() {
    setSelectedId(null);
    setView('menu');
  }

  async function handleSaved() {
    await reload(false);
    onChanged();
    setView('menu');
  }

  return <GameSheet open={open} label={`Lote ${group.groupName}`} testid="game-group-sheet" title={group.groupName} subtitle={subtitle} onClose={onClose} sprite={<CowSprite x={32} y={32} size={64} />}>
    <div className="game-sheet-body">
      {!selected && <div className="grid gap-2" data-testid="game-group-animals">
        {!members.length && <p className="text-sm" style={{ color: '#6b6e60' }}>Nenhum animal neste lote no momento.</p>}
        {members.map((animal) => <button key={animal.id} type="button" className="game-sheet-action" data-testid={`game-group-animal-${animal.id}`} onClick={() => { setSelectedId(animal.id); setView('menu'); }}>
          <span className="min-w-0 flex-1 text-left"><strong>{displayName(animal)}</strong>{animal.name && animal.tagNumber && <small>Brinco {animal.tagNumber}</small>}</span>
          <StatusBadge descriptor={animalStatusDescriptor(animal.status)} />
        </button>)}
      </div>}

      {selected && <>
        <button type="button" className="game-sheet-back" onClick={view === 'menu' ? backToList : () => setView('menu')}><ArrowLeft size={16} aria-hidden />{view === 'menu' ? 'Voltar ao lote' : `Voltar às ações de ${displayName(selected)}`}</button>
        {view === 'menu' && <div className="grid gap-2" data-testid="game-group-animal-actions">
          <div className="mb-1 flex items-center justify-between gap-2">
            <strong className="text-lg">{displayName(selected)}</strong>
            <StatusBadge descriptor={animalStatusDescriptor(selected.status)} />
          </div>
          <button type="button" className="game-sheet-action" onClick={() => setView('heat')}>
            <HeartPulse size={22} aria-hidden />
            <span><strong>Registrar cio/cobertura</strong><small>Fato reprodutivo observado hoje ou em outra data.</small></span>
          </button>
          {allowedNextStatuses(selected.status).length > 0 && <button type="button" className="game-sheet-action" onClick={() => setView('status')}>
            <RefreshCw size={22} aria-hidden />
            <span><strong>Alterar situação</strong><small>Secar, parto, venda ou morte — com histórico preservado.</small></span>
          </button>}
          <Link className="game-sheet-action" to={`/rebanho/${selected.id}`}>
            <NotebookPen size={22} aria-hidden />
            <span><strong>Editar ficha</strong><small>Abrir o histórico completo do animal.</small></span>
          </Link>
        </div>}
        {view === 'heat' && <ReproductiveEventForm animalId={selected.id} onCancel={() => setView('menu')} onSaved={handleSaved} />}
        {view === 'status' && <AnimalStatusChangeForm animalId={selected.id} currentStatus={selected.status} onCancel={() => setView('menu')} onSaved={handleSaved} />}
      </>}
    </div>
  </GameSheet>;
}

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRightLeft, History, Pencil, Scissors, Waypoints } from 'lucide-react';
import { formatDate } from '../../../domain/format';
import type { GameMapZone } from '../../../domain/game/state';
import type { HerdGroup } from '../animals/GroupPicker';
import type { PastureOccupancyRecord, PastureSummary } from '../pastures/types';
import { ErrorState, Field, FormErrorSummary, Input, SkeletonList } from '../../components/ui';
import { useToast } from '../../components/feedback-context';
import { useForm } from '../../hooks/useForm';
import { useResource } from '../../hooks/useResource';
import { useSubmit } from '../../hooks/useSubmit';
import { api, json } from '../../lib/api';
import { GameEntitySheet } from './GameEntitySheet';
import { gameTokens } from './tokens';

type PastureView = 'view' | 'rename' | 'move-pick' | 'move-confirm';

type MoveDraft = {
  groupId: string;
  groupName: string;
  /** Pasto de origem do lote (null = lote fora de pasto). */
  origin: PastureSummary | null;
  /** Pasto de destino (null = retirar sem destino). */
  destination: PastureSummary | null;
};

function formatArea(areaHa: string | null) {
  if (!areaHa) return null;
  const parsed = Number(areaHa);
  return Number.isFinite(parsed) ? `${parsed.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha` : `${areaHa} ha`;
}

function daysLabel(days: number) {
  return `${days} ${days === 1 ? 'dia' : 'dias'}`;
}

/** Sprite do pasto: dois mourões com trilhos sobre o capim do patchwork. */
function PastureSprite() {
  const { pasture, woodLight, woodLightDark } = gameTokens.colors;
  return <>
    <rect x="8" y="14" width="48" height="38" rx="9" fill={pasture[0]} />
    <line x1="14" y1="28" x2="50" y2="28" stroke={woodLight} strokeWidth="3" strokeLinecap="round" />
    <line x1="14" y1="38" x2="50" y2="38" stroke={woodLight} strokeWidth="3" strokeLinecap="round" />
    <rect x="18" y="20" width="5" height="26" rx="2.5" fill={woodLightDark} />
    <rect x="41" y="20" width="5" height="26" rx="2.5" fill={woodLightDark} />
  </>;
}

/** Histórico de rotação do pasto (ocupações reais, mais recente primeiro). */
function PastureHistory({ pastureId }: { pastureId: string }) {
  const { data, loading, error, reload } = useResource<PastureOccupancyRecord[]>(`/api/pastures/${pastureId}/occupancies`);
  if (loading) return <SkeletonList rows={2} />;
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data?.length) return <p className="game-notebook-empty">Nenhum lote ocupou este pasto ainda.</p>;
  return <div className="grid gap-1.5" data-testid="game-pasture-history">
    {data.map((row) => <div key={row.id} className="game-pasture-history-row">
      <strong>{row.herdGroupName}</strong>
      <small>{formatDate(row.startedOn)}{row.endedOn ? ` até ${formatDate(row.endedOn)}` : ' até hoje'}{row.notes ? ` · ${row.notes}` : ''}</small>
    </div>)}
  </div>;
}

/**
 * Folha do PASTO: abre ao tocar na área vazia de uma zona PASTURE (o toque no
 * rebanho continua abrindo a folha do lote). Mostra nome, área medida pelo
 * traçado, lote atual e uso/descanso derivados no servidor; as ações são
 * mover lote (rotação SEMPRE com confirmação explícita — decisão do usuário),
 * renomear (propaga para a zona), redesenhar e subdividir no editor.
 */
export function GamePastureSheet({ zone, today, onClose, onChanged }: {
  zone: GameMapZone | null;
  today: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const open = zone !== null;
  const toast = useToast();
  const pasturesResource = useResource<PastureSummary[]>('/api/pastures');
  const groupsResource = useResource<HerdGroup[]>('/api/herd-groups');
  const { busy, error, run, setError } = useSubmit();
  const [view, setView] = useState<PastureView>('view');
  const [draft, setDraft] = useState<MoveDraft | null>(null);
  const [movedOn, setMovedOn] = useState(today);

  useEffect(() => {
    if (open) {
      setView('view');
      setDraft(null);
      setMovedOn(today);
      setError('');
      void pasturesResource.reload(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, zone?.id]);

  const pastures = useMemo(() => pasturesResource.data ?? [], [pasturesResource.data]);
  const pasture = zone?.pastureId ? pastures.find((item) => item.id === zone.pastureId) ?? null : null;
  const occupancy = pasture?.currentOccupancy ?? null;

  const renameForm = useForm(
    { name: pasture?.name ?? zone?.name ?? '' },
    { name: (value) => (value.trim() ? undefined : 'Informe o nome do pasto.') },
  );

  if (!zone) return null;

  /** Lotes ativos que não estão neste pasto (candidatos a "trazer para cá"). */
  const bringCandidates = (groupsResource.data ?? [])
    .filter((group) => group.active && group.id !== occupancy?.herdGroupId)
    .map((group) => ({
      group,
      origin: pastures.find((item) => item.currentOccupancy?.herdGroupId === group.id) ?? null,
    }));
  /** Destinos para "mover este lote": pastos ativos e livres + retirada. */
  const sendDestinations = pastures.filter((item) => item.active && !item.currentOccupancy && item.id !== pasture?.id);

  function startBring(candidate: { group: HerdGroup; origin: PastureSummary | null }) {
    if (!pasture) return;
    setDraft({ groupId: candidate.group.id, groupName: candidate.group.name, origin: candidate.origin, destination: pasture });
    setView('move-confirm');
  }

  function startSend(destination: PastureSummary | null) {
    if (!occupancy) return;
    setDraft({ groupId: occupancy.herdGroupId, groupName: occupancy.herdGroupName, origin: pasture, destination });
    setView('move-confirm');
  }

  /** A consequência da rotação em linguagem clara, antes de qualquer gravação. */
  function moveConsequence(): string {
    if (!draft) return '';
    const when = movedOn === today ? `hoje, ${formatDate(movedOn)}` : `em ${formatDate(movedOn)}`;
    const rest = (origin: string) => `A ocupação de ${origin} é encerrada e o descanso começa a contar.`;
    if (draft.destination && draft.origin && draft.origin.id !== draft.destination.id) {
      return `${draft.groupName} sai de ${draft.origin.name} e vai para ${draft.destination.name} ${when}. ${rest(draft.origin.name)}`;
    }
    if (draft.destination && !draft.origin) {
      return `${draft.groupName}, que está fora de pasto, entra em ${draft.destination.name} ${when}.`;
    }
    if (!draft.destination && draft.origin) {
      return `${draft.groupName} sai de ${draft.origin.name} ${when} e fica sem pasto. ${rest(draft.origin.name)}`;
    }
    return `${draft.groupName} já está em ${draft.destination?.name ?? 'este pasto'}. Nada muda.`;
  }

  async function confirmMove() {
    if (!draft) return;
    await run(async () => {
      await api(`/api/herd-groups/${draft.groupId}/pasture`, json('POST', {
        pastureId: draft.destination?.id ?? null,
        movedOn,
        notes: null,
      }));
      toast(draft.destination ? `${draft.groupName} movido para ${draft.destination.name}` : `${draft.groupName} retirado do pasto`);
      await pasturesResource.reload(false);
      onChanged();
      setView('view');
      setDraft(null);
    });
  }

  async function saveRename() {
    if (!pasture) return;
    await run(async () => {
      await api(`/api/pastures/${pasture.id}`, json('PATCH', { name: renameForm.values.name.trim() }));
      toast('Pasto renomeado');
      await pasturesResource.reload(false);
      onChanged();
      setView('view');
    });
  }

  const situation = occupancy
    ? `${occupancy.herdGroupName} há ${daysLabel(occupancy.occupiedDays)}`
    : pasture?.restDays === null || !pasture ? 'Nunca ocupado'
      : `Em descanso há ${daysLabel(pasture.restDays)}`;
  const subtitle = pasture
    ? [formatArea(pasture.areaHa), situation].filter(Boolean).join(' · ')
    : 'Pasto ainda não vinculado ao cadastro.';

  return <GameEntitySheet
    open={open}
    label={`Pasto ${pasture?.name ?? zone.name}`}
    testid="game-pasture-sheet"
    title={pasture?.name ?? zone.name}
    subtitle={subtitle}
    onClose={onClose}
    sprite={<PastureSprite />}
  >
    {view !== 'view' && <button type="button" className="game-sheet-back" onClick={() => { setView('view'); setDraft(null); setError(''); }}><ArrowLeft size={16} aria-hidden />Voltar ao pasto</button>}
    {error && <div className="mb-3"><ErrorState message={error} /></div>}

    {view === 'view' && <>
      <div className="grid gap-2" data-testid="game-pasture-sheet-actions">
        {pasture && occupancy && <button type="button" className="game-sheet-action" onClick={() => setView('move-pick')}>
          <ArrowRightLeft size={22} aria-hidden />
          <span><strong>Mover este lote</strong><small>{occupancy.herdGroupName} vai para outro pasto, com confirmação.</small></span>
        </button>}
        {pasture && !occupancy && <button type="button" className="game-sheet-action" data-testid="game-pasture-bring" onClick={() => setView('move-pick')}>
          <ArrowRightLeft size={22} aria-hidden />
          <span><strong>Trazer lote para cá</strong><small>Escolha o lote que passa a ocupar este pasto.</small></span>
        </button>}
        {pasture && <button type="button" className="game-sheet-action" onClick={() => { renameForm.set('name', pasture.name); setView('rename'); }}>
          <Pencil size={22} aria-hidden />
          <span><strong>Renomear</strong><small>O nome novo aparece no mapa na hora.</small></span>
        </button>}
        <Link className="game-sheet-action" data-testid="game-pasture-retrace" to={`/jogo/mapa/editor?retraco=${zone.id}`}>
          <Waypoints size={22} aria-hidden />
          <span><strong>Redesenhar no mapa</strong><small>Retraçar o contorno; a área medida é recalculada.</small></span>
        </Link>
        {pasture && <Link className="game-sheet-action" data-testid="game-pasture-subdivide" to={`/jogo/mapa/editor?subdividir=${zone.id}`}>
          <Scissors size={22} aria-hidden />
          <span><strong>Subdividir</strong><small>Desenhar as novas áreas; o pasto atual é desativado.</small></span>
        </Link>}
      </div>
      {pasture && <div className="mt-4">
        <p className="game-notebook-heading"><History size={13} aria-hidden className="mr-1 inline" />Rotação registrada</p>
        <PastureHistory pastureId={pasture.id} />
      </div>}
    </>}

    {view === 'rename' && pasture && <form className="grid gap-3" noValidate onSubmit={(event) => { event.preventDefault(); if (renameForm.validate()) void saveRename(); }}>
      <FormErrorSummary errors={renameForm.visibleErrors} />
      <Field label="Nome do pasto" error={renameForm.error('name')}>
        <Input value={renameForm.values.name} onChange={(event) => renameForm.set('name', event.target.value)} onBlur={() => renameForm.blur('name')} required autoFocus />
      </Field>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="game-cta" disabled={busy}>{busy ? 'Salvando…' : 'Salvar nome'}</button>
      </div>
    </form>}

    {view === 'move-pick' && <>
      {occupancy && <div className="grid gap-2" data-testid="game-pasture-move-pick">
        <p className="game-notebook-heading">Para onde vai {occupancy.herdGroupName}?</p>
        {sendDestinations.map((destination) => <button key={destination.id} type="button" className="game-sheet-action" onClick={() => startSend(destination)}>
          <span className="min-w-0 flex-1 text-left"><strong>{destination.name}</strong><small>{destination.restDays === null ? 'Nunca ocupado' : `Em descanso há ${daysLabel(destination.restDays)}`}</small></span>
        </button>)}
        <button type="button" className="game-sheet-action" onClick={() => startSend(null)}>
          <span className="min-w-0 flex-1 text-left"><strong>Sem pasto (retirar)</strong><small>O lote sai do pasto e o descanso daqui começa a contar.</small></span>
        </button>
        {!sendDestinations.length && <p className="game-notebook-empty">Nenhum outro pasto livre no momento.</p>}
      </div>}
      {!occupancy && pasture && <div className="grid gap-2" data-testid="game-pasture-move-pick">
        <p className="game-notebook-heading">Qual lote vem para {pasture.name}?</p>
        {bringCandidates.map((candidate) => <button key={candidate.group.id} type="button" className="game-sheet-action" onClick={() => startBring(candidate)}>
          <span className="min-w-0 flex-1 text-left"><strong>{candidate.group.name}</strong><small>{candidate.origin ? `Hoje em ${candidate.origin.name}` : 'Fora de pasto'}</small></span>
        </button>)}
        {!bringCandidates.length && <p className="game-notebook-empty">Nenhum lote ativo disponível.</p>}
      </div>}
    </>}

    {view === 'move-confirm' && draft && <div className="grid gap-3" data-testid="game-pasture-move-confirm">
      <div className="notice notice-info"><strong>Confirme a rotação.</strong><p className="mt-1 text-sm">{moveConsequence()}</p></div>
      <Field label="Data da movimentação">
        <Input type="date" value={movedOn} max={today} onChange={(event) => setMovedOn(event.target.value)} required />
      </Field>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="game-cta" disabled={busy || !movedOn} onClick={() => void confirmMove()}>{busy ? 'Registrando…' : 'Confirmar movimentação'}</button>
        <button type="button" className="game-sheet-back" onClick={() => { setView('move-pick'); setError(''); }}>Voltar</button>
      </div>
    </div>}
  </GameEntitySheet>;
}

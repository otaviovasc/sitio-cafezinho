import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Pencil, ShoppingBag, Volume2, VolumeX } from 'lucide-react';
import { growthProgress } from '../../domain/game/planting';
import type { GameHerdGroup, GameMapInstallation, GameMapZone, GameMarker, GameState } from '../../domain/game/state';
import { GameActionSheet, type MangueiraView, type SheetResult } from '../features/game/GameActionSheet';
import { GameBalancaSheet } from '../features/game/GameBalancaSheet';
import { GameCasaSheet } from '../features/game/GameCasaSheet';
import { GameDepositoSheet } from '../features/game/GameDepositoSheet';
import { GameEnfermariaSheet } from '../features/game/GameEnfermariaSheet';
import { GameEstacaoSheet } from '../features/game/GameEstacaoSheet';
import { GameGroupSheet } from '../features/game/GameGroupSheet';
import { GameHud } from '../features/game/GameHud';
import { GameLojaSheet } from '../features/game/GameLojaSheet';
import { GameMap } from '../features/game/GameMap';
import { GameNotebook, type NotebookSheetTarget, type NotebookTab } from '../features/game/GameNotebook';
import { GamePastureSheet } from '../features/game/GamePastureSheet';
import { GamePlantacaoSheet } from '../features/game/GamePlantacaoSheet';
import { GameShell } from '../features/game/GameShell';
import { IndividualMilkReviewWorkspace, type IndividualMilkRelatedReview } from '../features/milk/IndividualMilkReviewWorkspace';
import { INSTALLATION_REGISTRY, type InstallationSheetKey } from '../features/game/installations.registry';
import { InstallationLayer, type TruckState } from '../features/game/layers/InstallationLayer';
import { MarkerLayer } from '../features/game/layers/MarkerLayer';
import { reviewDestination, type ReviewableAction, type ReviewOutcome } from '../features/game/review';
import { gameTokens } from '../features/game/tokens';
import { useGameAudio } from '../features/game/useGameAudio';
import { useToast } from '../components/feedback-context';
import { ErrorState } from '../components/ui';
import { useResource } from '../hooks/useResource';
import { api } from '../lib/api';

/** Slugs válidos do parâmetro `?caderno=` (espelha as abas do GameNotebook). */
const NOTEBOOK_TABS: NotebookTab[] = ['hoje', 'rebanho', 'producao', 'estoque', 'financeiro', 'saude', 'pendencias'];

/** Convite ilustrado do estado vazio: uma cerquinha e o chamado para traçar o mapa. */
function EmptyInvite() {
  const { wood, pasture, cow, cowSpot } = gameTokens.colors;
  return <div className="game-invite" data-testid="game-empty">
    <svg viewBox="0 0 160 84" width="160" height="84" role="img" aria-label="Desenho de um pasto com cerca e uma vaca">
      <ellipse cx="80" cy="62" rx="72" ry="18" fill={pasture[0]} />
      <g stroke={wood} strokeWidth="4" strokeLinecap="round">
        <line x1="22" y1="44" x2="22" y2="66" /><line x1="52" y1="40" x2="52" y2="64" />
        <line x1="16" y1="50" x2="58" y2="46" /><line x1="16" y1="58" x2="58" y2="54" />
      </g>
      <g>
        <ellipse cx="106" cy="52" rx="17" ry="11" fill={cow} />
        <circle cx="122" cy="45" r="7" fill={cow} />
        <ellipse cx="100" cy="49" rx="6" ry="4.5" fill={cowSpot} />
        <circle cx="124.5" cy="44" r="1.2" fill={cowSpot} />
        <rect x="96" y="60" width="3.5" height="8" rx="1.6" fill={cow} />
        <rect x="110" y="60" width="3.5" height="8" rx="1.6" fill={cow} />
      </g>
    </svg>
    <h1>Configure o mapa do sítio</h1>
    <p>Trace o perímetro e os pastos uma única vez sobre a foto de satélite. Depois, o sítio vira o seu tabuleiro.</p>
    <Link className="game-cta" to="/jogo/mapa/editor">Começar o traçado</Link>
  </div>;
}

export function GamePage() {
  const { data, error, loading, reload } = useResource<GameState>('/api/game/state');
  // Fila de revisão: mesma origem da aba Pendências do caderno (só leitura).
  const capturesResource = useResource<Array<{ id: string; actions: Array<{ id: string; status: string }> }>>('/api/captures');
  const pendingCount = (capturesResource.data ?? []).reduce((sum, capture) => sum + capture.actions.filter((action) => action.status === 'NEEDS_REVIEW').length, 0);
  const toast = useToast();
  const audio = useGameAudio();
  const location = useLocation();
  const navigate = useNavigate();
  const [openSheet, setOpenSheet] = useState<InstallationSheetKey | null>(null);
  // Sub-view inicial da folha da mangueira (pedida pela aba Produção do caderno).
  const [mangueiraView, setMangueiraView] = useState<MangueiraView | undefined>(undefined);
  const [selectedPlot, setSelectedPlot] = useState<GameMapZone | null>(null);
  const [notebook, setNotebook] = useState<{ tab?: NotebookTab; create?: boolean } | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<GameHerdGroup | null>(null);
  const [selectedPasture, setSelectedPasture] = useState<GameMapZone | null>(null);
  const [truckState, setTruckState] = useState<TruckState>('idle');
  // Revisão pós-IA contextual: a ação proposta aberta na folha do fato.
  const [review, setReview] = useState<{ action: ReviewableAction } | null>(null);
  const [individualReview, setIndividualReview] = useState<IndividualMilkRelatedReview | null>(null);
  // Relógio dos talhões: re-deriva os estágios periodicamente para as culturas
  // crescerem na tela sem recarregar o estado.
  const [plantingClock, setPlantingClock] = useState(() => Date.now());
  const hasMap = Boolean(data && data.map.zones.some((zone) => zone.kind === 'PERIMETER'));

  const plantings = useMemo(() => data?.plantings ?? [], [data]);
  useEffect(() => {
    const anyGrowing = plantings.some((planting) => growthProgress(planting.plantedAt, planting.durationHours, new Date(plantingClock)) < 1);
    if (!anyGrowing) return;
    const timer = window.setInterval(() => setPlantingClock(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, [plantings, plantingClock]);

  /**
   * Abre uma ação proposta na folha onde o fato vai viver (modo revisão).
   * Busca a captura completa para ter o payload; sem destino claro, cai no
   * caderno na aba Pendências (fallback de capturas ambíguas/múltiplas).
   */
  async function openReview(captureId: string, actionId?: string) {
    try {
      const capture = await api<{ id: string; actions: ReviewableAction[] }>(`/api/captures/${captureId}`);
      const pending = capture.actions.filter((action) => action.status === 'NEEDS_REVIEW');
      const action = actionId ? pending.find((item) => item.id === actionId) : pending[0];
      const target = action ? reviewDestination(action) : null;
      if (!action || !target) {
        setNotebook({ tab: 'pendencias' });
        return;
      }
      setNotebook(null);
      setSelectedPlot(null);
      setSelectedGroup(null);
      setSelectedPasture(null);
      if (action.actionType === 'INDIVIDUAL_MILK_SESSION') {
        const query = new URLSearchParams({ captureId, actionId: action.id });
        const related = await api<IndividualMilkRelatedReview>(`/api/import/milk-session/related?${query}`);
        setReview(null);
        setOpenSheet(null);
        setIndividualReview(related);
        return;
      }
      setIndividualReview(null);
      setReview({ action });
      setOpenSheet(target);
    } catch {
      toast('Não foi possível abrir a revisão desta captura.');
      setNotebook({ tab: 'pendencias' });
    }
  }

  // Chegadas externas: assistente (capture.tsx) navega para cá com o estado da
  // revisão; o fallback abre o caderno na aba Pendências.
  useEffect(() => {
    const state = location.state as { reviewCaptureId?: string; reviewActionId?: string; openNotebook?: NotebookTab } | null;
    if (!state) return;
    navigate('.', { replace: true, state: null });
    if (state.reviewCaptureId) void openReview(state.reviewCaptureId, state.reviewActionId);
    else if (state.openNotebook) setNotebook({ tab: state.openNotebook });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  // Entrada por link (menu "Caderno", redirect de /revisar): `/?caderno=pendencias`
  // abre o caderno na aba pedida e limpa o parâmetro para não reabrir sozinho.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const caderno = searchParams.get('caderno');
    if (!caderno) return;
    setSearchParams({}, { replace: true });
    const tab = NOTEBOOK_TABS.find((slug) => slug === caderno);
    setNotebook({ tab });
  }, [searchParams, setSearchParams]);

  function handleReviewDone(outcome: ReviewOutcome) {
    const captureId = individualReview?.sourceActions[0]?.captureId ?? review?.action.captureId;
    setReview(null);
    setIndividualReview(null);
    setOpenSheet(null);
    toast(outcome === 'committed' ? 'Registro confirmado' : 'Captura descartada');
    if (outcome === 'committed') audio.play('success');
    void reload(false);
    void capturesResource.reload(false);
    if (captureId) void (async () => {
      try {
        const capture = await api<{ actions: ReviewableAction[] }>(`/api/captures/${captureId}`);
        const next = capture.actions.find((action) => action.status === 'NEEDS_REVIEW');
        if (next) await openReview(captureId, next.id);
      } catch {
        // O registro já foi concluído; a fila do Caderno continua sendo o
        // fallback seguro caso a próxima revisão não possa ser aberta.
      }
    })();
  }

  /** Passa a revisão só para a folha de destino da ação aberta. */
  function reviewFor(key: InstallationSheetKey) {
    return review && reviewDestination(review.action) === key
      ? { action: review.action, onDone: handleReviewDone }
      : undefined;
  }

  function handleRegistered(result: SheetResult) {
    setOpenSheet(null);
    toast(result === 'collection' ? 'Coleta registrada' : result === 'milkingFeed' ? 'Trato da ordenha registrado' : result === 'individual' ? 'Controle individual registrado' : 'Produção registrada');
    audio.play(result === 'collection' ? 'truck' : result === 'milkingFeed' ? 'feed' : 'pour');
    if (result === 'collection') setTruckState('driving');
    void reload(false);
  }

  function openLoja() {
    setSelectedPlot(null);
    setOpenSheet('loja');
  }

  function handleSelectInstallation(installation: GameMapInstallation) {
    const entry = INSTALLATION_REGISTRY[installation.kind];
    if (!entry?.actionable) return;
    audio.play('click');
    setOpenSheet(entry.sheet);
  }

  function handleSelectPlot(zone: GameMapZone) {
    audio.play('click');
    setOpenSheet(null);
    setSelectedPlot(zone);
  }

  /** Toque na área vazia do pasto: abre a folha do pasto (o rebanho abre a do lote). */
  function handleSelectPasture(zone: GameMapZone) {
    audio.play('click');
    setSelectedGroup(null);
    setSelectedPasture(zone);
  }

  /** Tocar no marcador abre a folha correspondente à pendência. */
  function handleSelectMarker(marker: GameMarker) {
    audio.play('click');
    if (marker.kind === 'COLLECTION_MISSING') setOpenSheet('mangueira');
    else if (marker.kind === 'PURCHASE_OVERDUE') setOpenSheet('casa');
    else {
      const zone = data?.map.zones.find((item) => item.id === marker.targetId);
      if (zone) setSelectedPlot(zone);
    }
  }

  function handleNotebookTarget(target: NotebookSheetTarget) {
    audio.play('click');
    setNotebook(null);
    if (target === 'MANGUEIRA') setOpenSheet('mangueira');
    else if (target === 'MANGUEIRA_PRODUCAO' || target === 'MANGUEIRA_COLETA' || target === 'MANGUEIRA_INDIVIDUAL') {
      setMangueiraView(target === 'MANGUEIRA_PRODUCAO' ? 'dailyTotal' : target === 'MANGUEIRA_COLETA' ? 'collection' : 'individual');
      setOpenSheet('mangueira');
    }
    else if (target === 'ESTACAO_ALIMENTACAO') setOpenSheet('cocho');
    else if (target === 'LOJA') setOpenSheet('loja');
    else if (target === 'CASA') setOpenSheet('casa');
    else if (target === 'ENFERMARIA') setOpenSheet('enfermaria');
    else {
      const plot = data?.map.zones.find((zone) => zone.kind === 'PLOT');
      if (plot) setSelectedPlot(plot);
      else toast('Desenhe um talhão no editor do mapa para plantar.');
    }
  }

  const plotPlanting = selectedPlot ? plantings.find((planting) => planting.zoneId === selectedPlot.id) ?? null : null;

  return <GameShell>
    {loading && <div className="game-center" role="status">Preparando o sítio…</div>}
    {!loading && error && <div className="game-center"><ErrorState message={error} retry={() => void reload()} /></div>}
    {!loading && !error && data && !hasMap && <EmptyInvite />}
    {!loading && !error && data && hasMap && <>
      <GameMap state={data} onSelectGroup={(group) => { audio.play('moo'); setSelectedPasture(null); setSelectedGroup(group); }} onSelectPlot={handleSelectPlot} onSelectPasture={handleSelectPasture}>
        {(projection) => <>
          <InstallationLayer
            installations={data.map.installations}
            projection={projection}
            tankLevel={data.today.tankLevel}
            truckState={truckState}
            onTruckDone={() => setTruckState('idle')}
            onSelect={handleSelectInstallation}
          />
          <MarkerLayer
            markers={data.markers}
            zones={data.map.zones}
            installations={data.map.installations}
            projection={projection}
            onSelect={handleSelectMarker}
          />
        </>}
      </GameMap>
      <div className="game-hud">
        <GameHud
          state={data}
          pendingCount={pendingCount}
          onOpenNotebook={() => { audio.play('click'); setNotebook({}); }}
          onOpenPending={() => { audio.play('click'); setNotebook({ tab: 'pendencias' }); }}
          onOpenCreate={() => { audio.play('click'); setNotebook({ create: true }); }}
        />
        {data.unassignedCount > 0 && <div className="game-hud-chip game-hud-top-left" data-testid="game-corral">
          <small>Curral</small>{data.unassignedCount} fora do mapa
        </div>}
        <div className="game-hud-audio">
          <button
            type="button"
            className="game-zoom-button"
            data-testid="game-audio-toggle"
            data-muted={audio.muted}
            aria-label={audio.muted ? 'Ativar o som do jogo' : 'Silenciar o som do jogo'}
            aria-pressed={!audio.muted}
            onClick={audio.toggleMuted}
          >
            {audio.muted ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}
          </button>
        </div>
        <button type="button" className="game-hud-chip game-hud-bottom-left-raised-3" data-testid="game-loja-chip" aria-label="Abrir a Loja do sítio" onClick={() => { audio.play('click'); setOpenSheet('loja'); }}>
          <ShoppingBag size={15} aria-hidden />Loja
        </button>
        <Link className="game-hud-chip game-hud-bottom-left-raised" to="/jogo/mapa/editor" aria-label="Editar o mapa do sítio">
          <Pencil size={15} aria-hidden />Mapa
        </Link>
      </div>
    </>}
    {/* Folhas: montadas com o estado carregado, independente de o mapa existir —
        a revisão pós-IA também abre a folha do fato sem perímetro traçado. */}
    {!loading && !error && data && <>
      <GameActionSheet open={openSheet === 'mangueira'} state={data} review={reviewFor('mangueira')} initialView={mangueiraView} onClose={() => { setOpenSheet(null); setReview(null); setMangueiraView(undefined); }} onRegistered={handleRegistered} />
      {individualReview && <IndividualMilkReviewWorkspace
        review={individualReview}
        onClose={() => setIndividualReview(null)}
        onDone={handleReviewDone}
      />}
      {openSheet === 'deposito' && <GameDepositoSheet open review={reviewFor('deposito')} onClose={() => { setOpenSheet(null); setReview(null); }} onOpenLoja={() => setOpenSheet('loja')} />}
      {openSheet === 'loja' && <GameLojaSheet
        open
        onClose={() => setOpenSheet(null)}
        onPurchased={(item) => { toast(`Comprado: ${item.name}`); audio.play('buy'); void reload(false); }}
      />}
      {openSheet === 'lojaCombustivel' && <GameLojaSheet
        open
        initialCategory="combustivel"
        onClose={() => setOpenSheet(null)}
        onPurchased={(item) => { toast(`Comprado: ${item.name}`); audio.play('buy'); void reload(false); }}
      />}
      {openSheet === 'cocho' && <GameEstacaoSheet open review={reviewFor('cocho')} onClose={() => { setOpenSheet(null); setReview(null); }} onRegistered={() => { setOpenSheet(null); toast('Trato registrado'); audio.play('feed'); void reload(false); }} />}
      {openSheet === 'casa' && <GameCasaSheet
        open
        review={reviewFor('casa')}
        onClose={() => { setOpenSheet(null); setReview(null); }}
        onChanged={() => void reload(false)}
      />}
      {openSheet === 'balanca' && <GameBalancaSheet
        open
        today={data.today.date}
        review={reviewFor('balanca')}
        onClose={() => { setOpenSheet(null); setReview(null); }}
        onRegistered={() => { setOpenSheet(null); void reload(false); }}
      />}
      {openSheet === 'enfermaria' && <GameEnfermariaSheet
        open
        review={reviewFor('enfermaria')}
        onClose={() => { setOpenSheet(null); setReview(null); }}
        onChanged={() => void reload(false)}
      />}
      {selectedPlot && <GamePlantacaoSheet
        open
        zoneId={selectedPlot.id}
        zoneName={selectedPlot.name}
        planting={plotPlanting}
        onClose={() => setSelectedPlot(null)}
        onPlanted={() => { toast('Plantio registrado'); audio.play('plant'); setSelectedPlot(null); void reload(false); }}
        onHarvested={() => { audio.play('harvest'); void reload(false); }}
        onCancelled={() => { toast('Plantio cancelado'); audio.play('click'); setSelectedPlot(null); void reload(false); }}
        onOpenLoja={openLoja}
      />}
      {selectedGroup && <GameGroupSheet
        group={selectedGroup}
        zone={data.map.zones.find((zone) => zone.id === selectedGroup.zoneId) ?? null}
        onClose={() => setSelectedGroup(null)}
        onChanged={() => void reload(false)}
      />}
      {selectedPasture && <GamePastureSheet
        zone={selectedPasture}
        today={data.today.date}
        onClose={() => setSelectedPasture(null)}
        onChanged={() => void reload(false)}
      />}
      <GameNotebook
        open={notebook !== null}
        initialTab={notebook?.tab}
        startInCreate={notebook?.create}
        onClose={() => setNotebook(null)}
        onOpenInstallation={handleNotebookTarget}
        onOpenReview={(captureId, actionId) => void openReview(captureId, actionId)}
        onChanged={() => { void reload(false); void capturesResource.reload(false); }}
      />
    </>}
  </GameShell>;
}

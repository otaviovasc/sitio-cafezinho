import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, ShoppingBag, Volume2, VolumeX } from 'lucide-react';
import { growthProgress, growthStage } from '../../domain/game/planting';
import { GameActionSheet, type SheetResult } from '../features/game/GameActionSheet';
import { GameDepositoSheet } from '../features/game/GameDepositoSheet';
import { GameEstacaoSheet } from '../features/game/GameEstacaoSheet';
import { GameGroupSheet } from '../features/game/GameGroupSheet';
import { GameHud } from '../features/game/GameHud';
import { GameLojaSheet } from '../features/game/GameLojaSheet';
import { GameMap } from '../features/game/GameMap';
import { GamePlantacaoSheet } from '../features/game/GamePlantacaoSheet';
import { GameShell } from '../features/game/GameShell';
import { InstallationLayer, type TruckState } from '../features/game/layers/InstallationLayer';
import { gameTokens } from '../features/game/tokens';
import { useGameAudio } from '../features/game/useGameAudio';
import { useToast } from '../components/feedback-context';
import { ErrorState } from '../components/ui';
import { useResource } from '../hooks/useResource';
import type { GameHerdGroup, GameState } from '../../domain/game/state';

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
  const toast = useToast();
  const audio = useGameAudio();
  const [openInstallation, setOpenInstallation] = useState<'MANGUEIRA' | 'DEPOSITO' | 'ESTACAO_ALIMENTACAO' | 'PLANTACAO' | 'LOJA' | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<GameHerdGroup | null>(null);
  const [truckState, setTruckState] = useState<TruckState>('idle');
  // Relógio do talhão: re-deriva o estágio periodicamente para a cultura
  // crescer na tela sem recarregar o estado.
  const [plantingClock, setPlantingClock] = useState(() => Date.now());
  const hasMap = Boolean(data && data.map.zones.some((zone) => zone.kind === 'PERIMETER'));

  const planting = data?.planting ?? null;
  useEffect(() => {
    if (!planting || growthProgress(planting.plantedAt, planting.durationHours, new Date(plantingClock)) >= 1) return;
    const timer = window.setInterval(() => setPlantingClock(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, [planting, plantingClock]);
  const plantingStage = planting
    ? growthStage(growthProgress(planting.plantedAt, planting.durationHours, new Date(plantingClock)))
    : 'EMPTY';

  function handleRegistered(result: SheetResult) {
    setOpenInstallation(null);
    toast(result === 'collection' ? 'Coleta registrada' : result === 'milkingFeed' ? 'Trato da ordenha registrado' : 'Produção registrada');
    audio.play(result === 'collection' ? 'truck' : result === 'milkingFeed' ? 'feed' : 'pour');
    if (result === 'collection') setTruckState('driving');
    void reload(false);
  }

  return <GameShell>
    {loading && <div className="game-center" role="status">Preparando o sítio…</div>}
    {!loading && error && <div className="game-center"><ErrorState message={error} retry={() => void reload()} /></div>}
    {!loading && !error && data && !hasMap && <EmptyInvite />}
    {!loading && !error && data && hasMap && <>
      <GameMap state={data} onSelectGroup={(group) => { audio.play('moo'); setSelectedGroup(group); }}>
        {(projection) => <InstallationLayer
          installations={data.map.installations}
          projection={projection}
          tankLevel={data.today.tankLevel}
          truckState={truckState}
          plantingStage={plantingStage}
          onTruckDone={() => setTruckState('idle')}
          onSelect={(installation) => {
            if (installation.kind === 'MANGUEIRA' || installation.kind === 'DEPOSITO' || installation.kind === 'ESTACAO_ALIMENTACAO' || installation.kind === 'PLANTACAO') {
              audio.play('click');
              setOpenInstallation(installation.kind);
            }
          }}
        />}
      </GameMap>
      <div className="game-hud">
        <GameHud state={data} />
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
        <button type="button" className="game-hud-chip game-hud-bottom-left-raised-2" data-testid="game-loja-chip" aria-label="Abrir a Loja do sítio" onClick={() => { audio.play('click'); setOpenInstallation('LOJA'); }}>
          <ShoppingBag size={15} aria-hidden />Loja
        </button>
        <Link className="game-hud-chip game-hud-bottom-left-raised" to="/jogo/mapa/editor" aria-label="Editar o mapa do sítio">
          <Pencil size={15} aria-hidden />Mapa
        </Link>
      </div>
      <GameActionSheet open={openInstallation === 'MANGUEIRA'} state={data} onClose={() => setOpenInstallation(null)} onRegistered={handleRegistered} />
      {openInstallation === 'DEPOSITO' && <GameDepositoSheet open onClose={() => setOpenInstallation(null)} onOpenLoja={() => setOpenInstallation('LOJA')} />}
      {openInstallation === 'LOJA' && <GameLojaSheet
        open
        onClose={() => setOpenInstallation(null)}
        onPurchased={(item) => { toast(`Comprado: ${item.name}`); audio.play('buy'); void reload(false); }}
      />}
      {openInstallation === 'ESTACAO_ALIMENTACAO' && <GameEstacaoSheet open onClose={() => setOpenInstallation(null)} onRegistered={() => { setOpenInstallation(null); toast('Trato registrado'); audio.play('feed'); void reload(false); }} />}
      {openInstallation === 'PLANTACAO' && <GamePlantacaoSheet
        open
        planting={planting}
        onClose={() => setOpenInstallation(null)}
        onPlanted={() => { toast('Plantio registrado'); audio.play('plant'); setOpenInstallation(null); void reload(false); }}
        onHarvested={() => { audio.play('harvest'); void reload(false); }}
        onCancelled={() => { toast('Plantio cancelado'); audio.play('click'); setOpenInstallation(null); void reload(false); }}
        onOpenLoja={() => setOpenInstallation('LOJA')}
      />}
      {selectedGroup && <GameGroupSheet
        group={selectedGroup}
        zone={data.map.zones.find((zone) => zone.id === selectedGroup.zoneId) ?? null}
        onClose={() => setSelectedGroup(null)}
        onChanged={() => void reload(false)}
      />}
    </>}
  </GameShell>;
}

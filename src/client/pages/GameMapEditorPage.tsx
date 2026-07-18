import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Fence, Milk as MilkIcon, Trees, Undo2, Warehouse, X } from 'lucide-react';
import { ringError } from '../../domain/game/geometry';
import type { GameMapState, MapPoint } from '../../domain/game/state';
import { ConfirmButton } from '../components/feedback';
import { useToast } from '../components/feedback-context';
import { Button, ErrorState, Field, Input, LoadingState, PageHeader, SectionCard, Select } from '../components/ui';
import { LeafletCanvas } from '../features/game/editor/LeafletCanvas';
import { LocationStep } from '../features/game/editor/LocationStep';
import { useDrawing } from '../features/game/editor/useDrawing';
import type { HerdGroup } from '../features/animals/GroupPicker';
import { useResource } from '../hooks/useResource';
import { useSubmit } from '../hooks/useSubmit';
import { api, json } from '../lib/api';

type PlaceableKind = 'MANGUEIRA' | 'DEPOSITO' | 'ESTACAO_ALIMENTACAO' | 'GARAGEM';

const INSTALLATION_LABELS: Record<PlaceableKind, { name: string; hint: string }> = {
  MANGUEIRA: { name: 'Mangueira', hint: 'O coração do jogo: ordenha e coleta acontecem aqui.' },
  DEPOSITO: { name: 'Depósito', hint: 'Estoque de alimentação: compras e saldo por item.' },
  ESTACAO_ALIMENTACAO: { name: 'Estação de alimentação', hint: 'O cocho: registrar o trato dado ao rebanho.' },
  GARAGEM: { name: 'Garagem', hint: 'Decorativa — só aparece no tabuleiro.' },
};

/**
 * Editor do mapa (setup único): localizar → traçar perímetro → traçar pastos
 * (vinculados a lotes) → posicionar a mangueira. Leaflet vive só neste chunk.
 * O traçado salvo em lat/lng é a fonte única; o jogo renderiza a versão
 * estilizada (Chaikin) em /jogo.
 */
export function GameMapEditorPage() {
  const mapResource = useResource<GameMapState>('/api/game/map');
  const { data: groups } = useResource<HerdGroup[]>('/api/herd-groups');
  const drawing = useDrawing();
  const toast = useToast();
  const { busy, error, run, setError } = useSubmit();
  const [center, setCenter] = useState<MapPoint | null>(null);
  const [placingKind, setPlacingKind] = useState<PlaceableKind>('MANGUEIRA');
  const [pendingPasture, setPendingPasture] = useState<MapPoint[] | null>(null);
  const [pastureName, setPastureName] = useState('');
  const [pastureGroupId, setPastureGroupId] = useState('');

  const zones = useMemo(() => mapResource.data?.zones ?? [], [mapResource.data]);
  const installations = useMemo(() => mapResource.data?.installations ?? [], [mapResource.data]);
  const perimeter = zones.find((zone) => zone.kind === 'PERIMETER') ?? null;
  const pastures = zones.filter((zone) => zone.kind === 'PASTURE');
  const mangueira = installations.find((installation) => installation.kind === 'MANGUEIRA') ?? null;
  const linkedGroupIds = new Set(pastures.map((pasture) => pasture.herdGroupId).filter(Boolean));
  const needsLocation = !perimeter && !center;

  function handleMapClick(point: MapPoint) {
    if (drawing.mode === 'perimeter' || drawing.mode === 'pasture') {
      drawing.addVertex(point);
      return;
    }
    if (drawing.mode === 'installation') {
      void run(async () => {
        await api('/api/game/map/installations', json('POST', { kind: placingKind, name: INSTALLATION_LABELS[placingKind].name, position: point }));
        drawing.cancel();
        await mapResource.reload(false);
        toast(`${INSTALLATION_LABELS[placingKind].name} posicionada`);
      });
    }
  }

  function startPlacing(kind: PlaceableKind) {
    setPlacingKind(kind);
    drawing.start('installation');
  }

  function finishDraft() {
    const invalid = ringError(drawing.draft);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError('');
    if (drawing.mode === 'perimeter') {
      void run(async () => {
        await api('/api/game/map/zones', json('POST', { kind: 'PERIMETER', name: 'Sítio', ring: drawing.draft }));
        drawing.cancel();
        await mapResource.reload(false);
        toast('Perímetro do sítio salvo');
      });
      return;
    }
    setPendingPasture(drawing.draft);
    setPastureName(`Pasto ${pastures.length + 1}`);
    setPastureGroupId('');
    drawing.cancel();
  }

  function savePasture() {
    if (!pendingPasture) return;
    if (!pastureName.trim()) {
      setError('Dê um nome para o pasto.');
      return;
    }
    void run(async () => {
      await api('/api/game/map/zones', json('POST', {
        kind: 'PASTURE',
        name: pastureName.trim(),
        herdGroupId: pastureGroupId || null,
        ring: pendingPasture,
      }));
      setPendingPasture(null);
      await mapResource.reload(false);
      toast('Pasto salvo');
    });
  }

  async function removeZone(id: string) {
    await run(async () => {
      await api(`/api/game/map/zones/${id}`, { method: 'DELETE' });
      await mapResource.reload(false);
      toast('Área excluída');
    });
  }

  async function removeInstallation(id: string) {
    await run(async () => {
      await api(`/api/game/map/installations/${id}`, { method: 'DELETE' });
      await mapResource.reload(false);
      toast('Instalação excluída');
    });
  }

  const isDrawing = drawing.mode === 'perimeter' || drawing.mode === 'pasture';

  return <div className="page">
    <PageHeader
      title="Editor do mapa"
      subtitle="Trace o sítio uma única vez sobre o satélite. O jogo cuida do resto."
      action={perimeter && <Link className="game-cta" to="/jogo">Ver o jogo</Link>}
    />
    <div className="game-editor-layout">
      <LeafletCanvas
        center={center ?? (perimeter ? perimeter.ring[0] : null)}
        zones={zones}
        installations={installations}
        draft={drawing.draft}
        drawing={isDrawing || drawing.mode === 'installation'}
        onMapClick={handleMapClick}
      />
      <div className="grid content-start gap-4">
        {mapResource.loading && <LoadingState />}
        {!mapResource.loading && mapResource.error && <ErrorState message={mapResource.error} retry={() => void mapResource.reload()} />}
        {error && <ErrorState message={error} />}

        {!mapResource.loading && needsLocation && <SectionCard><LocationStep onLocate={(point) => { setCenter(point); toast('Mapa centralizado no sítio'); }} /></SectionCard>}

        {!mapResource.loading && !needsLocation && <>
          {isDrawing && <SectionCard title={drawing.mode === 'perimeter' ? 'Traçando o perímetro' : 'Traçando um pasto'}>
            <p className="text-sm text-[var(--muted)]">Toque no mapa para adicionar cada canto da área. {drawing.draft.length} {drawing.draft.length === 1 ? 'ponto marcado' : 'pontos marcados'}.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button data-testid="editor-finish" onClick={finishDraft} disabled={busy || drawing.draft.length < 3}><Check size={17} aria-hidden />Fechar área</Button>
              <Button variant="secondary" onClick={drawing.undoVertex} disabled={!drawing.draft.length}><Undo2 size={17} aria-hidden />Desfazer ponto</Button>
              <Button variant="secondary" onClick={() => { drawing.cancel(); setError(''); }}><X size={17} aria-hidden />Cancelar</Button>
            </div>
          </SectionCard>}

          {drawing.mode === 'installation' && <SectionCard title={`Posicionando: ${INSTALLATION_LABELS[placingKind].name}`}>
            <p className="text-sm text-[var(--muted)]">Toque no mapa onde fica. {INSTALLATION_LABELS[placingKind].hint}</p>
            <Button className="mt-3" variant="secondary" onClick={drawing.cancel}><X size={17} aria-hidden />Cancelar</Button>
          </SectionCard>}

          {pendingPasture && <SectionCard title="Novo pasto">
            <div className="grid gap-3">
              <Field label="Nome do pasto"><Input value={pastureName} onChange={(event) => setPastureName(event.target.value)} required /></Field>
              <Field label="Lote que fica neste pasto" hint="Opcional: o lote aparece pastando aqui no jogo.">
                <Select value={pastureGroupId} onChange={(event) => setPastureGroupId(event.target.value)}>
                  <option value="">Sem lote por enquanto</option>
                  {groups?.filter((group) => group.active && (!linkedGroupIds.has(group.id) || group.id === pastureGroupId)).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </Select>
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button onClick={savePasture} disabled={busy}>Salvar pasto</Button>
                <Button variant="secondary" onClick={() => { setPendingPasture(null); setError(''); }}>Descartar</Button>
              </div>
            </div>
          </SectionCard>}

          {drawing.mode === 'idle' && !pendingPasture && <SectionCard title="Montagem do sítio">
            <ol className="grid gap-3">
              <li className="guide-step">
                <Fence size={20} aria-hidden />
                <strong>1. Perímetro {perimeter && <Check className="inline text-[var(--success)]" size={16} aria-hidden />}</strong>
                {perimeter
                  ? <div className="flex items-center justify-between gap-2"><p>“{perimeter.name}” traçado.</p><ConfirmButton variant="danger" question="O traçado do perímetro será apagado (os pastos precisam ser excluídos antes)." onClick={() => void removeZone(perimeter.id)}>Excluir</ConfirmButton></div>
                  : <><p>O contorno do terreno todo. Comece por aqui.</p><Button className="mt-2" onClick={() => drawing.start('perimeter')}>Traçar perímetro</Button></>}
              </li>
              <li className="guide-step">
                <Trees size={20} aria-hidden />
                <strong>2. Pastos {pastures.length > 0 && <span className="text-sm font-semibold text-[var(--muted)]">({pastures.length})</span>}</strong>
                {pastures.length > 0 && <ul className="grid gap-1 text-sm">
                  {pastures.map((pasture) => <li key={pasture.id} className="flex items-center justify-between gap-2">
                    <span>{pasture.name}{pasture.herdGroupId && groups ? ` — ${groups.find((group) => group.id === pasture.herdGroupId)?.name ?? 'lote'}` : ''}</span>
                    <ConfirmButton variant="danger" question={`O pasto “${pasture.name}” será apagado do mapa.`} onClick={() => void removeZone(pasture.id)}>Excluir</ConfirmButton>
                  </li>)}
                </ul>}
                <p>Cada pasto pode receber um lote do rebanho.</p>
                <Button className="mt-2" variant={pastures.length ? 'secondary' : 'primary'} onClick={() => drawing.start('pasture')} disabled={!perimeter}>Adicionar pasto</Button>
              </li>
              <li className="guide-step">
                <MilkIcon size={20} aria-hidden />
                <strong>3. Mangueira {mangueira && <Check className="inline text-[var(--success)]" size={16} aria-hidden />}</strong>
                {mangueira
                  ? <div className="flex items-center justify-between gap-2"><p>Posicionada. É onde a ordenha acontece no jogo.</p><ConfirmButton variant="danger" question="A mangueira será removida do mapa." onClick={() => void removeInstallation(mangueira.id)}>Excluir</ConfirmButton></div>
                  : <><p>O coração do jogo: ordenha e coleta acontecem aqui.</p><Button className="mt-2" onClick={() => startPlacing('MANGUEIRA')} disabled={!perimeter}>Posicionar mangueira</Button></>}
              </li>
              <li className="guide-step">
                <Warehouse size={20} aria-hidden />
                <strong>4. Outras instalações</strong>
                <p>Depósito e estação registram alimentação; a garagem é decorativa.</p>
                <div className="mt-2 grid gap-2">
                  {(['DEPOSITO', 'ESTACAO_ALIMENTACAO', 'GARAGEM'] as const).map((kind) => {
                    const existing = installations.find((installation) => installation.kind === kind) ?? null;
                    return <div key={kind} className="flex items-center justify-between gap-2 text-sm">
                      <span>{INSTALLATION_LABELS[kind].name} {existing && <Check className="inline text-[var(--success)]" size={15} aria-hidden />}</span>
                      {existing
                        ? <ConfirmButton variant="danger" question={`${INSTALLATION_LABELS[kind].name} será removida do mapa.`} onClick={() => void removeInstallation(existing.id)}>Excluir</ConfirmButton>
                        : <Button variant="secondary" onClick={() => startPlacing(kind)} disabled={!perimeter}>Posicionar</Button>}
                    </div>;
                  })}
                </div>
              </li>
            </ol>
          </SectionCard>}
        </>}
      </div>
    </div>
  </div>;
}

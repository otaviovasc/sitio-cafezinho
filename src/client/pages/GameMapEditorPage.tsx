import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Fence, Milk as MilkIcon, Trees, Undo2, Warehouse, X } from 'lucide-react';
import { ringAreaHa, ringError } from '../../domain/game/geometry';
import type { GameMapState, MapPoint } from '../../domain/game/state';
import { ConfirmButton } from '../components/feedback';
import { useToast } from '../components/feedback-context';
import { Button, ErrorState, Field, Input, LoadingState, PageHeader, SectionCard, Select } from '../components/ui';
import { LeafletCanvas } from '../features/game/editor/LeafletCanvas';
import { LocationStep } from '../features/game/editor/LocationStep';
import { useDrawing } from '../features/game/editor/useDrawing';
import type { PastureSummary } from '../features/pastures/types';
import { useResource } from '../hooks/useResource';
import { useSubmit } from '../hooks/useSubmit';
import { api, json } from '../lib/api';

type PlaceableKind = 'MANGUEIRA' | 'DEPOSITO' | 'ESTACAO_ALIMENTACAO' | 'PLANTACAO' | 'GARAGEM';

const INSTALLATION_LABELS: Record<PlaceableKind, { name: string; hint: string }> = {
  MANGUEIRA: { name: 'Mangueira', hint: 'O coração do jogo: ordenha e coleta acontecem aqui.' },
  DEPOSITO: { name: 'Depósito', hint: 'Estoque de alimentação: compras e saldo por item.' },
  ESTACAO_ALIMENTACAO: { name: 'Estação de alimentação', hint: 'O cocho: registrar o trato dado ao rebanho.' },
  PLANTACAO: { name: 'Plantação', hint: 'O talhão: plantio com insumos, crescimento e colheita.' },
  GARAGEM: { name: 'Garagem', hint: 'Decorativa — só aparece no tabuleiro.' },
};

/**
 * Editor do mapa (setup único): localizar → traçar perímetro → traçar pastos
 * (cada um desenha um PASTO real) → posicionar a mangueira. Leaflet vive só
 * neste chunk. O traçado salvo em lat/lng é a fonte única; o jogo renderiza a
 * versão estilizada (Chaikin) em /jogo e o lote exibido na zona é derivado da
 * ocupação atual do pasto.
 */
export function GameMapEditorPage() {
  const mapResource = useResource<GameMapState>('/api/game/map');
  const pasturesResource = useResource<PastureSummary[]>('/api/pastures');
  const pastures = pasturesResource.data;
  const drawing = useDrawing();
  const toast = useToast();
  const { busy, error, run, setError } = useSubmit();
  const [searchParams, setSearchParams] = useSearchParams();
  const [center, setCenter] = useState<MapPoint | null>(null);
  const [placingKind, setPlacingKind] = useState<PlaceableKind>('MANGUEIRA');
  const [pendingPasture, setPendingPasture] = useState<MapPoint[] | null>(null);
  const [pastureName, setPastureName] = useState('');
  const [pastureId, setPastureId] = useState('');

  const zones = useMemo(() => mapResource.data?.zones ?? [], [mapResource.data]);
  const installations = useMemo(() => mapResource.data?.installations ?? [], [mapResource.data]);
  const perimeter = zones.find((zone) => zone.kind === 'PERIMETER') ?? null;
  const pastureZones = zones.filter((zone) => zone.kind === 'PASTURE');
  const mangueira = installations.find((installation) => installation.kind === 'MANGUEIRA') ?? null;
  const pastureById = new Map((pastures ?? []).map((pasture) => [pasture.id, pasture]));
  const linkedPastureIds = new Set(pastureZones.map((zone) => zone.pastureId).filter(Boolean));
  const linkablePastures = (pastures ?? []).filter((pasture) => pasture.active && (!linkedPastureIds.has(pasture.id) || pasture.id === pastureId));
  const needsLocation = !perimeter && !center;

  // Deep-link vindo de /pastos (?pasto=<id>): abre o traçado já com o pasto
  // escolhido para vínculo. Dispara uma única vez por navegação.
  const requestedPastureId = searchParams.get('pasto');
  const autoStartRef = useRef(false);
  useEffect(() => {
    if (autoStartRef.current || !requestedPastureId || mapResource.loading || !perimeter) return;
    if (linkedPastureIds.has(requestedPastureId)) return;
    autoStartRef.current = true;
    drawing.start('pasture');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedPastureId, mapResource.loading, perimeter]);

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
    const requested = requestedPastureId && !linkedPastureIds.has(requestedPastureId) ? requestedPastureId : '';
    setPastureId(requested);
    setPastureName(requested ? pastureById.get(requested)?.name ?? '' : `Pasto ${pastureZones.length + 1}`);
    drawing.cancel();
    // Recarrega os pastos: um cadastro feito depois da abertura do editor
    // (outra aba, ou a página /pastos) precisa aparecer no vínculo.
    void pasturesResource.reload(false);
  }

  function savePasture() {
    if (!pendingPasture) return;
    if (!pastureName.trim()) {
      setError('Dê um nome para o pasto.');
      return;
    }
    void run(async () => {
      // Sem vínculo escolhido, a área desenhada cria o pasto real pelo
      // endpoint validado — o desenho e o cadastro nunca divergem.
      let linkedId = pastureId || null;
      if (!linkedId) {
        const created = await api<{ id: string }>('/api/pastures', json('POST', { name: pastureName.trim(), areaHa: null }));
        linkedId = created.id;
      }
      await api('/api/game/map/zones', json('POST', {
        kind: 'PASTURE',
        name: pastureName.trim(),
        pastureId: linkedId,
        ring: pendingPasture,
      }));
      setPendingPasture(null);
      if (requestedPastureId) setSearchParams({}, { replace: true });
      await Promise.all([mapResource.reload(false), pasturesResource.reload(false)]);
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
              <p className="text-sm text-[var(--muted)]">
                Área medida pelo traçado: <strong>{ringAreaHa(pendingPasture).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha</strong> — gravada no pasto ao salvar.
              </p>
              <Field label="Nome do pasto"><Input value={pastureName} onChange={(event) => setPastureName(event.target.value)} required /></Field>
              <Field label="Pasto que esta área desenha" hint="Sem vínculo, um pasto novo é criado com o nome acima. O lote que ocupar o pasto aparece pastando aqui no jogo.">
                <Select value={pastureId} onChange={(event) => setPastureId(event.target.value)}>
                  <option value="">Criar pasto novo com este nome</option>
                  {linkablePastures.map((pasture) => <option key={pasture.id} value={pasture.id}>{pasture.name}</option>)}
                </Select>
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button onClick={savePasture} disabled={busy}>Salvar pasto</Button>
                <Button variant="secondary" onClick={() => { setPendingPasture(null); setError(''); if (requestedPastureId) setSearchParams({}, { replace: true }); }}>Descartar</Button>
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
                <strong>2. Pastos {pastureZones.length > 0 && <span className="text-sm font-semibold text-[var(--muted)]">({pastureZones.length})</span>}</strong>
                {pastureZones.length > 0 && <ul className="grid gap-1 text-sm">
                  {pastureZones.map((zone) => {
                    const linked = zone.pastureId ? pastureById.get(zone.pastureId) : null;
                    const occupant = linked?.currentOccupancy?.herdGroupName;
                    return <li key={zone.id} className="flex items-center justify-between gap-2">
                      <span>{zone.name}{linked ? ` — ${linked.name}` : ''}{linked?.areaHa ? ` · ${Number(linked.areaHa).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha` : ''}{occupant ? ` · ${occupant}` : ''}</span>
                      <ConfirmButton variant="danger" question={`O pasto “${zone.name}” será apagado do mapa.`} onClick={() => void removeZone(zone.id)}>Excluir</ConfirmButton>
                    </li>;
                  })}
                </ul>}
                <p>Cada área desenha um pasto real; o lote exibido é o que ocupa o pasto no momento.</p>
                <Button className="mt-2" variant={pastureZones.length ? 'secondary' : 'primary'} onClick={() => drawing.start('pasture')} disabled={!perimeter}>Adicionar pasto</Button>
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
                <p>Depósito e estação registram alimentação; a plantação planta e colhe; a garagem é decorativa.</p>
                <div className="mt-2 grid gap-2">
                  {(['DEPOSITO', 'ESTACAO_ALIMENTACAO', 'PLANTACAO', 'GARAGEM'] as const).map((kind) => {
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

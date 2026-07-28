import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Fence, Milk as MilkIcon, Move, Scissors, Sprout, Trees, Undo2, Warehouse, X } from 'lucide-react';
import { ringAreaHa, ringError } from '../../domain/game/geometry';
import type { GameMapInstallation, GameMapState, GameMapZone, MapInstallationKind, MapPoint } from '../../domain/game/state';
import { subdivisionName } from '../../domain/pastures';
import { ConfirmButton } from '../components/feedback';
import { useToast } from '../components/feedback-context';
import { Button, ErrorState, Field, Input, LoadingState, PageHeader, SectionCard, Select } from '../components/ui';
import { LeafletCanvas } from '../features/game/editor/LeafletCanvas';
import { LocationStep } from '../features/game/editor/LocationStep';
import { useDrawing } from '../features/game/editor/useDrawing';
import { INSTALLATION_REGISTRY } from '../features/game/installations.registry';
import type { PastureSummary } from '../features/pastures/types';
import { useResource } from '../hooks/useResource';
import { useSubmit } from '../hooks/useSubmit';
import { api, json } from '../lib/api';

/** Kinds posicionáveis no editor: todos, na ordem do passo "Outras instalações". */
const PLACEABLE_KINDS = Object.keys(INSTALLATION_REGISTRY) as MapInstallationKind[];

/**
 * Editor do mapa: localizar → traçar perímetro → traçar pastos (cada um
 * desenha um PASTO real) e talhões (PLOT) → posicionar as instalações.
 * Leaflet vive só neste chunk. O traçado salvo em lat/lng é a fonte única; o
 * jogo renderiza a versão estilizada em / (a home). Além de criar, o editor edita:
 * retraçar uma zona (PATCH, mantém o vínculo e recalcula a área medida) e
 * mover uma instalação (PATCH, modo "mover": selecionar → clicar no novo
 * ponto). Falhas de contenção do servidor aparecem como mensagem clara.
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
  const [placingKind, setPlacingKind] = useState<MapInstallationKind>('MANGUEIRA');
  const [pendingPasture, setPendingPasture] = useState<MapPoint[] | null>(null);
  const [pastureName, setPastureName] = useState('');
  const [pastureId, setPastureId] = useState('');
  const [pendingPlot, setPendingPlot] = useState<MapPoint[] | null>(null);
  const [plotName, setPlotName] = useState('');
  const [retracingZone, setRetracingZone] = useState<GameMapZone | null>(null);
  const [movingInstallation, setMovingInstallation] = useState<GameMapInstallation | null>(null);
  // Subdivisão guiada (deep-link ?subdividir=<zoneId>): anéis fechados dentro
  // do pasto; o servidor desativa o original e cria os novos numa transação.
  const [subdividingZone, setSubdividingZone] = useState<GameMapZone | null>(null);
  const [subdivisionRings, setSubdivisionRings] = useState<MapPoint[][]>([]);

  const zones = useMemo(() => mapResource.data?.zones ?? [], [mapResource.data]);
  const installations = useMemo(() => mapResource.data?.installations ?? [], [mapResource.data]);
  const perimeter = zones.find((zone) => zone.kind === 'PERIMETER') ?? null;
  const pastureZones = zones.filter((zone) => zone.kind === 'PASTURE');
  const plotZones = zones.filter((zone) => zone.kind === 'PLOT');
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

  // Deep-links da folha do pasto no jogo: ?retraco=<zoneId> abre o retraçado da
  // zona; ?subdividir=<zoneId> abre a subdivisão guiada. Uma vez por navegação.
  const requestedRetraceId = searchParams.get('retraco');
  const requestedSubdivideId = searchParams.get('subdividir');
  const retraceStartRef = useRef(false);
  const subdivideStartRef = useRef(false);
  useEffect(() => {
    if (retraceStartRef.current || !requestedRetraceId || mapResource.loading || !perimeter) return;
    const target = zones.find((zone) => zone.id === requestedRetraceId && zone.kind !== 'PERIMETER');
    if (!target) return;
    retraceStartRef.current = true;
    setRetracingZone(target);
    drawing.start('retrace');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedRetraceId, mapResource.loading, perimeter, zones]);
  useEffect(() => {
    if (subdivideStartRef.current || !requestedSubdivideId || mapResource.loading || !perimeter) return;
    const target = zones.find((zone) => zone.id === requestedSubdivideId && zone.kind === 'PASTURE' && zone.pastureId);
    if (!target) return;
    subdivideStartRef.current = true;
    setSubdividingZone(target);
    setSubdivisionRings([]);
    drawing.start('subdivide');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedSubdivideId, mapResource.loading, perimeter, zones]);

  function handleMapClick(point: MapPoint) {
    if (drawing.mode === 'perimeter' || drawing.mode === 'pasture' || drawing.mode === 'plot' || drawing.mode === 'retrace' || drawing.mode === 'subdivide') {
      drawing.addVertex(point);
      return;
    }
    if (drawing.mode === 'installation') {
      const entry = INSTALLATION_REGISTRY[placingKind];
      const count = installations.filter((installation) => installation.kind === placingKind).length;
      const name = count > 0 ? `${entry.label} ${count + 1}` : entry.label;
      void run(async () => {
        await api('/api/game/map/installations', json('POST', { kind: placingKind, name, position: point }));
        drawing.cancel();
        await mapResource.reload(false);
        toast(`${name} posicionada`);
      });
      return;
    }
    if (drawing.mode === 'move' && movingInstallation) {
      const target = movingInstallation;
      void run(async () => {
        await api(`/api/game/map/installations/${target.id}`, json('PATCH', { position: point }));
        setMovingInstallation(null);
        drawing.cancel();
        await mapResource.reload(false);
        toast(`${target.name} movida`);
      });
    }
  }

  function startPlacing(kind: MapInstallationKind) {
    setPlacingKind(kind);
    drawing.start('installation');
  }

  function startRetrace(zone: GameMapZone) {
    setRetracingZone(zone);
    drawing.start('retrace');
  }

  function startMove(installation: GameMapInstallation) {
    setMovingInstallation(installation);
    drawing.start('move');
  }

  function cancelAll() {
    drawing.cancel();
    setRetracingZone(null);
    setMovingInstallation(null);
    setSubdividingZone(null);
    setSubdivisionRings([]);
    setError('');
    if (requestedRetraceId || requestedSubdivideId) setSearchParams({}, { replace: true });
  }

  function finishDraft() {
    const invalid = ringError(drawing.draft);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError('');
    if (drawing.mode === 'subdivide') {
      // Anel fechado: acumula e recomeça o traçado da próxima área.
      setSubdivisionRings((current) => [...current, drawing.draft]);
      drawing.start('subdivide');
      return;
    }
    if (drawing.mode === 'perimeter') {
      void run(async () => {
        await api('/api/game/map/zones', json('POST', { kind: 'PERIMETER', name: 'Sítio', ring: drawing.draft }));
        drawing.cancel();
        await mapResource.reload(false);
        toast('Perímetro do sítio salvo');
      });
      return;
    }
    if (drawing.mode === 'retrace' && retracingZone) {
      const target = retracingZone;
      void run(async () => {
        // O PATCH mantém o vínculo (pasto/plantios) e o servidor recalcula a
        // área medida do pasto a partir do novo anel.
        await api(`/api/game/map/zones/${target.id}`, json('PATCH', { ring: drawing.draft }));
        cancelAll();
        await Promise.all([mapResource.reload(false), pasturesResource.reload(false)]);
        toast(`“${target.name}” retraçada`);
      });
      return;
    }
    if (drawing.mode === 'plot') {
      setPendingPlot(drawing.draft);
      setPlotName(`Talhão ${plotZones.length + 1}`);
      drawing.cancel();
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

  function savePlot() {
    if (!pendingPlot) return;
    if (!plotName.trim()) {
      setError('Dê um nome para o talhão.');
      return;
    }
    void run(async () => {
      await api('/api/game/map/zones', json('POST', { kind: 'PLOT', name: plotName.trim(), ring: pendingPlot }));
      setPendingPlot(null);
      await mapResource.reload(false);
      toast('Talhão salvo');
    });
  }

  function undoSubdivisionRing() {
    setSubdivisionRings((current) => current.slice(0, -1));
  }

  function completeSubdivision() {
    if (!subdividingZone?.pastureId || subdivisionRings.length < 2) return;
    const target = subdividingZone;
    void run(async () => {
      const result = await api<{ created: Array<{ id: string; name: string }> }>(`/api/pastures/${target.pastureId}/subdivide`, json('POST', { rings: subdivisionRings }));
      cancelAll();
      await Promise.all([mapResource.reload(false), pasturesResource.reload(false)]);
      toast(`“${target.name}” subdividido em ${result.created.map((pasture) => pasture.name).join(', ')}`);
    });
  }

  async function removeZone(id: string) {    await run(async () => {
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

  const isDrawing = drawing.mode === 'perimeter' || drawing.mode === 'pasture' || drawing.mode === 'plot' || drawing.mode === 'retrace' || drawing.mode === 'subdivide';
  const drawingTitles: Record<string, string> = {
    perimeter: 'Traçando o perímetro',
    pasture: 'Traçando um pasto',
    plot: 'Traçando um talhão',
    retrace: `Retraçando “${retracingZone?.name ?? ''}”`,
  };
  const subdividingPasture = subdividingZone?.pastureId ? pastureById.get(subdividingZone.pastureId) ?? null : null;
  const subdividingOccupant = subdividingPasture?.currentOccupancy?.herdGroupName ?? null;

  return <div className="page">
    <PageHeader
      title="Editor do mapa"
      subtitle="Trace o sítio uma única vez sobre o satélite. O jogo cuida do resto."
      action={perimeter && <Link className="game-cta" to="/">Ver o jogo</Link>}
    />
    <div className="game-editor-layout">
      <LeafletCanvas
        center={center ?? (perimeter ? perimeter.ring[0] : null)}
        zones={zones}
        installations={installations}
        draft={drawing.draft}
        drawing={isDrawing || drawing.mode === 'installation' || drawing.mode === 'move'}
        onMapClick={handleMapClick}
      />
      <div className="grid content-start gap-4">
        {mapResource.loading && <LoadingState />}
        {!mapResource.loading && mapResource.error && <ErrorState message={mapResource.error} retry={() => void mapResource.reload()} />}
        {error && <ErrorState message={error} />}

        {!mapResource.loading && !perimeter && requestedPastureId && !linkedPastureIds.has(requestedPastureId) && <div className="notice notice-warning">
          <strong>Trace o perímetro antes do pasto.</strong>
          <p className="mt-1 text-sm">Você veio para desenhar o pasto “{pastureById.get(requestedPastureId)?.name ?? 'selecionado'}”, mas o sítio ainda não tem perímetro. Centre o mapa e trace o contorno do terreno (passo 1) — depois o desenho do pasto começa automaticamente.</p>
        </div>}

        {!mapResource.loading && needsLocation && <SectionCard><LocationStep onLocate={(point) => { setCenter(point); toast('Mapa centralizado no sítio'); }} /></SectionCard>}

        {!mapResource.loading && !needsLocation && <>
          {isDrawing && drawing.mode !== 'subdivide' && <SectionCard title={drawingTitles[drawing.mode] ?? 'Traçando'}>
            <p className="text-sm text-[var(--muted)]">Toque no mapa para adicionar cada canto da área. {drawing.draft.length} {drawing.draft.length === 1 ? 'ponto marcado' : 'pontos marcados'}.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button data-testid="editor-finish" onClick={finishDraft} disabled={busy || drawing.draft.length < 3}><Check size={17} aria-hidden />Fechar área</Button>
              <Button variant="secondary" onClick={drawing.undoVertex} disabled={!drawing.draft.length}><Undo2 size={17} aria-hidden />Desfazer ponto</Button>
              <Button variant="secondary" onClick={cancelAll}><X size={17} aria-hidden />Cancelar</Button>
            </div>
          </SectionCard>}

          {drawing.mode === 'subdivide' && subdividingZone && <SectionCard title={`Subdividindo “${subdividingPasture?.name ?? subdividingZone.name}”`}>
            {subdividingOccupant
              ? <div className="notice notice-warning">
                <strong>Pasto ocupado por {subdividingOccupant}.</strong>
                <p className="mt-1 text-sm">Um pasto ocupado não pode ser desativado. Mova o lote para outro pasto primeiro — abra o pasto no jogo e use “Mover este lote”, que sempre pede confirmação.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link className="button button-primary" to="/">Abrir o jogo</Link>
                  <Button variant="secondary" onClick={cancelAll}><X size={17} aria-hidden />Cancelar</Button>
                </div>
              </div>
              : <>
                <p className="text-sm text-[var(--muted)]">Desenhe as novas áreas uma por vez dentro do pasto. Ao concluir, o pasto atual é desativado e cada área vira um pasto novo com a área medida pelo próprio traçado.</p>
                {subdivisionRings.length > 0 && <ul className="mt-3 grid gap-1 text-sm" data-testid="editor-subdivide-rings">
                  {subdivisionRings.map((ring, index) => <li key={index} className="flex items-center justify-between gap-2">
                    <span>{subdivisionName(subdividingPasture?.name ?? subdividingZone.name, index)} · {ringAreaHa(ring).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha</span>
                    {index === subdivisionRings.length - 1 && <Button variant="secondary" onClick={undoSubdivisionRing}><Undo2 size={15} aria-hidden />Desfazer área</Button>}
                  </li>)}
                </ul>}
                <p className="mt-3 text-sm text-[var(--muted)]">Área {subdivisionRings.length + 1}: {drawing.draft.length} {drawing.draft.length === 1 ? 'ponto marcado' : 'pontos marcados'}.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button data-testid="editor-finish" onClick={finishDraft} disabled={busy || drawing.draft.length < 3}><Check size={17} aria-hidden />Fechar área</Button>
                  <Button variant="secondary" onClick={drawing.undoVertex} disabled={!drawing.draft.length}><Undo2 size={17} aria-hidden />Desfazer ponto</Button>
                  <Button data-testid="editor-subdivide-finish" onClick={completeSubdivision} disabled={busy || subdivisionRings.length < 2 || drawing.draft.length > 0}><Scissors size={17} aria-hidden />Concluir subdivisão ({subdivisionRings.length})</Button>
                  <Button variant="secondary" onClick={cancelAll}><X size={17} aria-hidden />Cancelar</Button>
                </div>
              </>}
          </SectionCard>}

          {drawing.mode === 'installation' && <SectionCard title={`Posicionando: ${INSTALLATION_REGISTRY[placingKind].label}`}>
            <p className="text-sm text-[var(--muted)]">Toque no mapa onde fica. {INSTALLATION_REGISTRY[placingKind].hint}</p>
            <Button className="mt-3" variant="secondary" onClick={cancelAll}><X size={17} aria-hidden />Cancelar</Button>
          </SectionCard>}

          {drawing.mode === 'move' && movingInstallation && <SectionCard title={`Movendo: ${movingInstallation.name}`}>
            <p className="text-sm text-[var(--muted)]">Toque no novo lugar do mapa. A instalação precisa ficar dentro do perímetro.</p>
            <Button className="mt-3" variant="secondary" onClick={cancelAll}><X size={17} aria-hidden />Cancelar</Button>
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

          {pendingPlot && <SectionCard title="Novo talhão">
            <div className="grid gap-3">
              <p className="text-sm text-[var(--muted)]">O talhão é a terra de roça: cada um tem seu próprio ciclo de plantio no jogo.</p>
              <Field label="Nome do talhão"><Input value={plotName} onChange={(event) => setPlotName(event.target.value)} required /></Field>
              <div className="flex flex-wrap gap-2">
                <Button data-testid="editor-plot-save" onClick={savePlot} disabled={busy}>Salvar talhão</Button>
                <Button variant="secondary" onClick={() => { setPendingPlot(null); setError(''); }}>Descartar</Button>
              </div>
            </div>
          </SectionCard>}

          {drawing.mode === 'idle' && !pendingPasture && !pendingPlot && <SectionCard title="Montagem do sítio">
            <ol className="grid gap-3">
              <li className="guide-step">
                <Fence size={20} aria-hidden />
                <strong>1. Perímetro {perimeter && <Check className="inline text-[var(--success)]" size={16} aria-hidden />}</strong>
                {perimeter
                  ? <div className="flex items-center justify-between gap-2"><p>“{perimeter.name}” traçado.</p><ConfirmButton variant="danger" question="O traçado do perímetro será apagado (os pastos e talhões precisam ser excluídos antes)." onClick={() => void removeZone(perimeter.id)}>Excluir</ConfirmButton></div>
                  : <><p>O contorno do terreno todo. Comece por aqui.</p><Button className="mt-2" onClick={() => drawing.start('perimeter')}>Traçar perímetro</Button></>}
              </li>
              <li className="guide-step">
                <Trees size={20} aria-hidden />
                <strong>2. Pastos {pastureZones.length > 0 && <span className="text-sm font-semibold text-[var(--muted)]">({pastureZones.length})</span>}</strong>
                {pastureZones.length > 0 && <ul className="grid gap-1 text-sm">
                  {pastureZones.map((zone) => {
                    const linked = zone.pastureId ? pastureById.get(zone.pastureId) : null;
                    const occupant = linked?.currentOccupancy?.herdGroupName;
                    const displayName = linked?.name ?? zone.name;
                    return <li key={zone.id} className="flex items-center justify-between gap-2">
                      <span>{displayName}{linked?.areaHa ? ` · ${Number(linked.areaHa).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha` : ''}{occupant ? ` · ${occupant}` : ''}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        <Button variant="secondary" data-testid={`editor-zone-retrace-${zone.id}`} onClick={() => startRetrace(zone)}>Retraçar</Button>
                        <ConfirmButton variant="danger" question={`O pasto “${displayName}” será apagado do mapa.`} onClick={() => void removeZone(zone.id)}>Excluir</ConfirmButton>
                      </span>
                    </li>;
                  })}
                </ul>}
                <p>Cada área desenha um pasto real; o lote exibido é o que ocupa o pasto no momento.</p>
                <Button className="mt-2" variant={pastureZones.length ? 'secondary' : 'primary'} onClick={() => drawing.start('pasture')} disabled={!perimeter}>Adicionar pasto</Button>
              </li>
              <li className="guide-step">
                <Sprout size={20} aria-hidden />
                <strong>3. Talhões {plotZones.length > 0 && <span className="text-sm font-semibold text-[var(--muted)]">({plotZones.length})</span>}</strong>
                {plotZones.length > 0 && <ul className="grid gap-1 text-sm">
                  {plotZones.map((zone) => <li key={zone.id} className="flex items-center justify-between gap-2">
                    <span>{zone.name}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      <Button variant="secondary" data-testid={`editor-zone-retrace-${zone.id}`} onClick={() => startRetrace(zone)}>Retraçar</Button>
                      <ConfirmButton variant="danger" question={`O talhão “${zone.name}” sai do mapa (com plantios registrados, ele é só desativado — o histórico é preservado).`} onClick={() => void removeZone(zone.id)}>Excluir</ConfirmButton>
                    </span>
                  </li>)}
                </ul>}
                <p>Terra de roça: cada talhão tem seu próprio ciclo de plantio.</p>
                <Button className="mt-2" variant={plotZones.length ? 'secondary' : 'primary'} onClick={() => drawing.start('plot')} disabled={!perimeter}>Adicionar talhão</Button>
              </li>
              <li className="guide-step">
                <MilkIcon size={20} aria-hidden />
                <strong>4. Mangueira {mangueira && <Check className="inline text-[var(--success)]" size={16} aria-hidden />}</strong>
                {mangueira
                  ? <div className="flex items-center justify-between gap-2">
                    <p>Posicionada. É onde a ordenha acontece no jogo.</p>
                    <span className="flex shrink-0 items-center gap-1">
                      <Button variant="secondary" data-testid={`editor-installation-move-${mangueira.id}`} onClick={() => startMove(mangueira)}><Move size={15} aria-hidden />Mover</Button>
                      <ConfirmButton variant="danger" question="A mangueira será removida do mapa." onClick={() => void removeInstallation(mangueira.id)}>Excluir</ConfirmButton>
                    </span>
                  </div>
                  : <><p>O coração do jogo: ordenha e coleta acontecem aqui.</p><Button className="mt-2" onClick={() => startPlacing('MANGUEIRA')} disabled={!perimeter}>Posicionar mangueira</Button></>}
              </li>
              <li className="guide-step">
                <Warehouse size={20} aria-hidden />
                <strong>5. Outras instalações</strong>
                <p>Depósito, cocho, garagem, casa, balança, enfermaria e a porteira — cada uma com sua função no jogo.</p>
                <div className="mt-2 grid gap-2">
                  {PLACEABLE_KINDS.filter((kind) => kind !== 'MANGUEIRA').map((kind) => {
                    const entry = INSTALLATION_REGISTRY[kind];
                    const instances = installations.filter((installation) => installation.kind === kind);
                    return <div key={kind} className="grid gap-1 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span>{entry.label} {instances.length > 0 && !entry.multiInstance && <Check className="inline text-[var(--success)]" size={15} aria-hidden />}{entry.multiInstance && instances.length > 0 && <span className="text-xs font-semibold text-[var(--muted)]">({instances.length})</span>}</span>
                        {(entry.multiInstance || instances.length === 0) && <Button variant="secondary" onClick={() => startPlacing(kind)} disabled={!perimeter}>Posicionar</Button>}
                      </div>
                      {instances.map((installation) => <div key={installation.id} className="flex items-center justify-between gap-2 pl-3 text-xs text-[var(--muted)]">
                        <span>{installation.name}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          <Button variant="secondary" data-testid={`editor-installation-move-${installation.id}`} onClick={() => startMove(installation)}><Move size={14} aria-hidden />Mover</Button>
                          <ConfirmButton variant="danger" question={`${installation.name} será removida do mapa.`} onClick={() => void removeInstallation(installation.id)}>Excluir</ConfirmButton>
                        </span>
                      </div>)}
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

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRightLeft, Archive, ArchiveRestore, Beef, ClipboardList, Droplets, ExternalLink, HeartPulse, Home, Milk, Package, PackagePlus, Pencil, Plus, RefreshCw, Search, ShoppingCart, Sprout, Truck, Wallet, Wheat } from 'lucide-react';
import { allowedNextStatuses, isLiveStatus, type AnimalStatus } from '../../../domain/animal-lifecycle';
import { formatDate, formatLiters, formatMoney, normalizeLabel } from '../../../domain/format';
import type { GameMarker, GameState } from '../../../domain/game/state';
import { formatFeedQuantity, type FeedInventoryRow } from '../feeding/types';
import { CatalogItemEditor } from '../feeding/CatalogItemEditor';
import { FeedItemForm } from '../feeding/FeedItemForm';
import { AnimalForm } from '../animals/AnimalForm';
import { AnimalGroupChangeForm } from '../animals/AnimalGroupChangeForm';
import { AnimalStatusChangeForm } from '../animals/AnimalStatusChangeForm';
import { HerdGroupForm } from '../animals/HerdGroupForm';
import { ReproductiveEventForm } from '../animals/ReproductiveEventForm';
import { individualProductionLabel, type IndividualProductionSummary } from '../animals/individual-production';
import { MastitisCaseForm } from '../health/mastitis';
import { TodayPanel } from '../dashboard/TodayPanel';
import type { HerdGroup } from '../animals/GroupPicker';
import { useToast } from '../../components/feedback-context';
import { Button, ErrorState, Field, Input, Select, SkeletonList, StatusBadge, SubmitBar } from '../../components/ui';
import { ParsedDecimalInput } from '../../components/form-controls';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { api, json } from '../../lib/api';
import { animalSexLabels, categoryLabels, milkingRoutineLabels } from '../../lib/labels';
import {
  animalStatusDescriptor, captureInputKindLabel, commitStatusDescriptor, mastitisDetectionLabel,
  mastitisQuarterLabel, mastitisStatusDescriptor, milkCollectionSourceLabel, proposedActionStatusDescriptor,
  proposedActionTypeLabel, purchaseStatusDescriptor, revenueStatusDescriptor, type StatusDescriptor,
} from '../../lib/status';
import { GameEntityActions, type GameEntityAction } from './GameEntitySheet';
import { GameSheet } from './GameSheet';
import { gameAudio } from './audio';
import { gameTokens } from './tokens';

export type NotebookTab = 'hoje' | 'rebanho' | 'producao' | 'estoque' | 'financeiro' | 'saude' | 'pendencias';
/** Folha de instalação que o caderno pede para a GamePage abrir (criação ou pendência). */
export type NotebookSheetTarget = 'MANGUEIRA' | 'MANGUEIRA_PRODUCAO' | 'MANGUEIRA_COLETA' | 'MANGUEIRA_INDIVIDUAL' | 'ESTACAO_ALIMENTACAO' | 'LOJA' | 'PLOT' | 'CASA' | 'ENFERMARIA';

// Shapes das listagens existentes (somente leitura) consumidas pelo caderno.
type AnimalRow = {
  id: string; name: string | null; tagNumber: string | null; status: AnimalStatus; sex: 'FEMALE' | 'MALE';
  aliases: { id: string; alias: string }[];
  currentGroup: { id: string; name: string } | null;
  latestWeight: { weightKg: string; measuredAt: string } | null;
  latestProduction: IndividualProductionSummary | Pick<IndividualProductionSummary, 'totalLiters' | 'sessionDate'> | null;
  latestProductions?: IndividualProductionSummary[];
};
type DailyTotalRow = { id: string; productionDate: string; herdGroupName: string | null; morningLiters: string | null; afternoonLiters: string | null; totalLiters: string | null };
type SessionRow = { id: string; sessionDate: string; title: string | null; confirmedTotal: string; confirmedCount: number; reviewCount: number };
type CollectionRow = { id: string; collectionDate: string; liters: string; source: string };
type PurchaseRow = { id: string; description: string; supplierName: string | null; purchaseDate: string; category: string; totalAmount: string; dueDate: string | null; status: string; isOverdue: boolean };
type RevenueRow = { id: string; description: string; revenueDate: string; category: string; amount: string; status: string; animalName: string | null; tagNumber: string | null; buyerName: string | null };
type MastitisRow = { id: string; animalId: string; animalName: string | null; tagNumber: string | null; detectedAt: string; affectedQuarter: string; detectionMethod: string; status: string; withdrawalEndsAt: string | null };
type CaptureActionRow = {
  id: string;
  actionType: string;
  commitStatus: string;
  status: string;
  issues?: string[] | null;
  resolvedPayload?: Record<string, unknown> | null;
};
type CaptureDocumentRow = { ordinal: number; originalFilename: string; mimeType: string; attachmentId: string | null; storageWarning: string | null };
type CaptureRow = { id: string; inputKind: string; transcript: string | null; createdAt: string; documents?: CaptureDocumentRow[]; actions: CaptureActionRow[] };

type NotebookDetail =
  | { type: 'animal'; row: AnimalRow }
  | { type: 'group'; row: HerdGroup | null }
  | { type: 'dailyTotal'; row: DailyTotalRow }
  | { type: 'session'; row: SessionRow }
  | { type: 'collection'; row: CollectionRow }
  | { type: 'feedItem'; row: FeedInventoryRow }
  | { type: 'purchase'; row: PurchaseRow }
  | { type: 'revenue'; row: RevenueRow }
  | { type: 'mastitis'; row: MastitisRow }
  | { type: 'captureAction'; capture: CaptureRow; action: CaptureActionRow };

type DetailInfo = {
  title: string;
  subtitle?: string;
  badge?: StatusDescriptor;
  fields: { label: string; value: string }[];
  link?: { to: string; label: string };
};

/** Recurso de leitura carregado sob demanda: só bate no endpoint quando `active`. */
function useLazyResource<T>(path: string, active: boolean) {
  const [state, setState] = useState<{ data: T | null; error: string; loading: boolean }>({ data: null, error: '', loading: false });
  // `started` fica num ref: marcá-lo via setState re-dispararia o efeito (ele é
  // dependência indireta) e o cleanup cancelaria o fetch em voo.
  const startedRef = useRef(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active || startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: '' }));
    api<T>(path)
      .then((data) => { if (!cancelled) setState({ data, error: '', loading: false }); })
      .catch((cause) => { if (!cancelled) setState({ data: null, error: cause instanceof Error ? cause.message : 'Não foi possível carregar.', loading: false }); });
    return () => { cancelled = true; };
  }, [active, path, attempt]);
  const reload = () => { startedRef.current = false; setAttempt((current) => current + 1); };
  return { data: state.data, error: state.error, loading: state.loading, reload };
}

const TABS: { slug: NotebookTab; label: string; icon: ReactNode }[] = [
  { slug: 'hoje', label: 'Hoje', icon: <Home size={15} aria-hidden /> },
  { slug: 'rebanho', label: 'Rebanho', icon: <Beef size={15} aria-hidden /> },
  { slug: 'producao', label: 'Produção', icon: <Milk size={15} aria-hidden /> },
  { slug: 'estoque', label: 'Estoque', icon: <Package size={15} aria-hidden /> },
  { slug: 'financeiro', label: 'Financeiro', icon: <Wallet size={15} aria-hidden /> },
  { slug: 'saude', label: 'Saúde', icon: <HeartPulse size={15} aria-hidden /> },
  { slug: 'pendencias', label: 'Pendências', icon: <ClipboardList size={15} aria-hidden /> },
];

function displayName(animal: Pick<AnimalRow, 'name' | 'tagNumber'>) {
  return animal.name || `Brinco ${animal.tagNumber}`;
}

function productionsOf(animal: AnimalRow) {
  if (animal.latestProductions) return animal.latestProductions;
  if (!animal.latestProduction) return [];
  if ('morningLiters' in animal.latestProduction) return [animal.latestProduction];
  return [{
    id: `latest-${animal.id}`,
    sessionDate: animal.latestProduction.sessionDate,
    herdGroupId: null,
    herdGroupName: null,
    morningLiters: null,
    afternoonLiters: null,
    totalLiters: animal.latestProduction.totalLiters,
  }];
}

function animalListSubtitle(animal: AnimalRow) {
  const identity = `${animal.tagNumber ? `Brinco ${animal.tagNumber} · ` : ''}${animal.currentGroup?.name ?? 'Sem lote'}`;
  const productions = productionsOf(animal);
  if (!productions.length) return `${identity} · Sem medição individual`;
  return `${identity} · ${productions.map(individualProductionLabel).join(' | ')}`;
}

function excerpt(text: string, max = 90) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function dateOf(timestamp: string) {
  return formatDate(timestamp.slice(0, 10));
}

/** Sprite do caderno: capa terracota, lombada de madeira e linhas da página. */
function NotebookSprite() {
  const { roof, milk, wood, ink } = gameTokens.colors;
  return <>
    <rect x="10" y="11" width="44" height="43" rx="7" fill={roof} />
    <rect x="15" y="15" width="35" height="35" rx="3.5" fill={milk} />
    <rect x="10" y="11" width="7" height="43" rx="3.5" fill={wood} />
    <rect x="21" y="22" width="23" height="3" rx="1.5" fill={ink} opacity="0.22" />
    <rect x="21" y="29" width="23" height="3" rx="1.5" fill={ink} opacity="0.22" />
    <rect x="21" y="36" width="15" height="3" rx="1.5" fill={ink} opacity="0.22" />
  </>;
}

function NotebookSection({ title, children }: { title: string; children: ReactNode }) {
  return <div className="grid gap-1.5">
    <p className="game-notebook-heading">{title}</p>
    <div className="grid gap-2">{children}</div>
  </div>;
}

/** Chips de filtro client-side das abas do caderno (testid `<prefix>-<slug>`). */
function FilterChips({ options, value, onChange, testidPrefix, label }: {
  options: { slug: string; label: string }[];
  value: string;
  onChange: (slug: string) => void;
  testidPrefix: string;
  label: string;
}) {
  return <div className="game-notebook-filters" role="group" aria-label={label}>
    {options.map((option) => <button key={option.slug} type="button" className="game-notebook-filter" data-active={value === option.slug} data-testid={`${testidPrefix}-${option.slug}`} aria-pressed={value === option.slug} onClick={() => onChange(option.slug)}>
      {option.label}
    </button>)}
  </div>;
}

function NotebookPanel<T>({ state, empty, children }: {
  state: { data: T[] | null; error: string; loading: boolean; reload: () => void };
  empty: string;
  children: (rows: T[]) => ReactNode;
}) {
  if (state.loading && !state.data) return <SkeletonList rows={3} />;
  if (state.error) return <ErrorState message={state.error} retry={state.reload} />;
  const rows = state.data ?? [];
  if (!rows.length) return <p className="game-notebook-empty">{empty}</p>;
  return <>{children(rows)}</>;
}

function detailId(detail: NotebookDetail): string {
  if (detail.type === 'captureAction') return detail.action.id;
  if (detail.type === 'feedItem') return detail.row.feedItemId;
  if (detail.type === 'group') return detail.row?.id ?? 'novo';
  return detail.row.id;
}

function NotebookRow({ detail, title, subtitle, badge, onOpen }: {
  detail: NotebookDetail;
  title: string;
  subtitle: string;
  badge?: StatusDescriptor;
  onOpen: (detail: NotebookDetail) => void;
}) {
  return <button type="button" className="game-sheet-action" data-testid={`game-notebook-item-${detail.type}-${detailId(detail)}`} onClick={() => onOpen(detail)}>
    <span className="min-w-0 flex-1 text-left"><strong>{title}</strong><small>{subtitle}</small></span>
    {badge && <StatusBadge descriptor={badge} />}
  </button>;
}

function DetailHeader({ info }: { info: DetailInfo }) {
  return <div className="mb-3">
    <div className="flex items-center justify-between gap-2">
      <strong className="text-lg">{info.title}</strong>
      {info.badge && <StatusBadge descriptor={info.badge} />}
    </div>
    {info.subtitle && <p className="game-notebook-subtitle">{info.subtitle}</p>}
  </div>;
}

function DetailFields({ fields }: { fields: DetailInfo['fields'] }) {
  return <dl className="game-notebook-fields">
    {fields.map((field) => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}
  </dl>;
}

function DetailLink({ link }: { link: NonNullable<DetailInfo['link']> }) {
  return <Link className="game-notebook-link" to={link.to}>{link.label}<ExternalLink size={14} aria-hidden /></Link>;
}

/** Mapa declarativo tipo de entidade → detalhe somente-leitura (fase 1). */
function describeDetail(detail: Exclude<NotebookDetail, { type: 'group' }>): DetailInfo {
  switch (detail.type) {
    case 'animal': {
      const { row } = detail;
      const productions = productionsOf(row);
      return {
        title: displayName(row),
        subtitle: row.name && row.tagNumber ? `Brinco ${row.tagNumber}` : undefined,
        badge: animalStatusDescriptor(row.status),
        fields: [
          { label: 'Sexo', value: animalSexLabels[row.sex] ?? row.sex },
          { label: 'Lote', value: row.currentGroup?.name ?? 'Sem lote' },
          { label: 'Última pesagem', value: row.latestWeight ? `${Number(row.latestWeight.weightKg).toLocaleString('pt-BR')} kg em ${dateOf(row.latestWeight.measuredAt)}` : 'Nunca pesado' },
          ...productions.map((production, index) => ({
            label: index === 0 ? 'Último controle' : 'Controle anterior',
            value: individualProductionLabel(production),
          })),
          ...(!productions.length ? [{ label: 'Últimos controles', value: 'Sem medição individual' }] : []),
        ],
        link: { to: `/rebanho/${row.id}`, label: 'Abrir ficha completa' },
      };
    }
    case 'dailyTotal': {
      const { row } = detail;
      return {
        title: `Produção de ${dateOf(row.productionDate)}`,
        subtitle: row.herdGroupName ?? 'Rebanho todo',
        fields: [
          { label: 'Manhã', value: row.morningLiters !== null ? formatLiters(row.morningLiters) : 'Não registrada' },
          { label: 'Tarde', value: row.afternoonLiters !== null ? formatLiters(row.afternoonLiters) : 'Não registrada' },
          { label: 'Total', value: row.totalLiters !== null ? formatLiters(row.totalLiters) : '—' },
        ],
        link: { to: '/producao', label: 'Abrir produção' },
      };
    }
    case 'session': {
      const { row } = detail;
      return {
        title: `Controle de ${dateOf(row.sessionDate)}`,
        subtitle: row.title ?? 'Controle individual',
        badge: row.reviewCount > 0 ? { label: `${row.reviewCount} a revisar`, tone: 'warning' } : { label: 'Confirmado', tone: 'success' },
        fields: [
          { label: 'Total confirmado', value: formatLiters(row.confirmedTotal) },
          { label: 'Animais confirmados', value: String(row.confirmedCount) },
        ],
        link: { to: `/producao/${row.id}`, label: 'Abrir controle' },
      };
    }
    case 'collection': {
      const { row } = detail;
      return {
        title: `Coleta de ${dateOf(row.collectionDate)}`,
        subtitle: milkCollectionSourceLabel[row.source] ?? row.source,
        fields: [{ label: 'Volume', value: formatLiters(row.liters) }],
        link: { to: `/producao/coletas/${row.id}`, label: 'Abrir coleta' },
      };
    }
    case 'feedItem': {
      const { row } = detail;
      return {
        title: row.name,
        subtitle: `Saldo ${formatFeedQuantity(row.balance, row.canonicalUnit)}`,
        fields: [
          { label: 'Comprado', value: formatFeedQuantity(row.purchasedQuantity, row.canonicalUnit) },
          { label: 'Usado', value: formatFeedQuantity(row.consumedQuantity, row.canonicalUnit) },
          { label: 'Saldo', value: formatFeedQuantity(row.balance, row.canonicalUnit) },
        ],
        link: { to: '/estoque-alimentos', label: 'Abrir estoque' },
      };
    }
    case 'purchase': {
      const { row } = detail;
      return {
        title: row.description,
        subtitle: `${dateOf(row.purchaseDate)} · ${row.supplierName ?? 'Sem fornecedor'}`,
        badge: purchaseStatusDescriptor(row.status, row.isOverdue),
        fields: [
          { label: 'Categoria', value: categoryLabels[row.category] ?? row.category },
          { label: 'Total', value: formatMoney(row.totalAmount) },
          { label: 'Vencimento', value: row.dueDate ? dateOf(row.dueDate) : '—' },
        ],
        link: { to: `/compras/${row.id}`, label: 'Abrir compra' },
      };
    }
    case 'revenue': {
      const { row } = detail;
      const who = row.animalName ?? (row.tagNumber ? `Brinco ${row.tagNumber}` : row.buyerName);
      return {
        title: row.description,
        subtitle: `${dateOf(row.revenueDate)}${who ? ` · ${who}` : ''}`,
        badge: revenueStatusDescriptor[row.status],
        fields: [
          { label: 'Categoria', value: categoryLabels[row.category] ?? row.category },
          { label: 'Valor', value: formatMoney(row.amount) },
        ],
        link: { to: `/receitas/${row.id}`, label: 'Abrir receita' },
      };
    }
    case 'mastitis': {
      const { row } = detail;
      return {
        title: row.animalName ?? `Brinco ${row.tagNumber}`,
        subtitle: `Detectada em ${dateOf(row.detectedAt)}`,
        badge: mastitisStatusDescriptor[row.status],
        fields: [
          { label: 'Teto', value: mastitisQuarterLabel[row.affectedQuarter] ?? row.affectedQuarter },
          { label: 'Detecção', value: mastitisDetectionLabel[row.detectionMethod] ?? row.detectionMethod },
        ],
        link: { to: `/mastite/${row.id}`, label: 'Abrir caso' },
      };
    }
    case 'captureAction': {
      const { capture, action } = detail;
      return {
        title: proposedActionTypeLabel[action.actionType] ?? action.actionType,
        subtitle: `Recebida em ${dateOf(capture.createdAt)}`,
        badge: commitStatusDescriptor[action.commitStatus] ?? proposedActionStatusDescriptor[action.status],
        fields: [
          { label: 'Origem', value: captureInputKindLabel[capture.inputKind] ?? capture.inputKind },
          ...(capture.transcript ? [{ label: 'Transcrição', value: excerpt(capture.transcript) }] : []),
        ],
      };
    }
  }
}

type IndividualImportPreview = {
  sessionDate?: unknown;
  herdGroupLabel?: unknown;
  measurements?: unknown;
};

function individualImportFromAction(action: CaptureActionRow): IndividualImportPreview | null {
  if (action.actionType !== 'INDIVIDUAL_MILK_SESSION' || !action.resolvedPayload) return null;
  const imported = action.resolvedPayload.import;
  return imported && typeof imported === 'object' ? imported as IndividualImportPreview : null;
}

function previewLiters(value: unknown) {
  return typeof value === 'number' || typeof value === 'string' ? formatLiters(value) : 'Sem valor legível';
}

function IndividualCapturePreview({ action }: { action: CaptureActionRow }) {
  const imported = individualImportFromAction(action);
  const rows = Array.isArray(imported?.measurements)
    ? imported.measurements.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    : [];
  if (!imported || !rows.length) return null;

  return <section className="game-notebook-capture-preview" aria-label="Medições encontradas na captura">
    <div className="game-notebook-capture-preview-heading">
      <div>
        <strong>{rows.length} {rows.length === 1 ? 'medição encontrada' : 'medições encontradas'}</strong>
        <small>Confira cada vaca antes de confirmar na mangueira.</small>
      </div>
      <span>{typeof imported.sessionDate === 'string' ? formatDate(imported.sessionDate) : 'Data a confirmar'}</span>
    </div>
    <div className="grid gap-2">
      {rows.map((row, index) => {
        const label = typeof row.rawAnimalLabel === 'string' ? row.rawAnimalLabel : `Linha ${index + 1}`;
        const morning = row.morningLiters;
        const afternoon = row.afternoonLiters;
        return <article className="game-notebook-capture-row" key={`${label}-${index}`}>
          <div>
            <strong>{label}</strong>
            {typeof row.rawValueText === 'string' && <small>Original: “{row.rawValueText}”</small>}
          </div>
          <div className="text-right">
            <strong>{previewLiters(row.totalLiters)}</strong>
            <small>{morning !== null && morning !== undefined ? `Manhã ${previewLiters(morning)}` : 'Manhã sem medição'} · {afternoon !== null && afternoon !== undefined ? `Tarde ${previewLiters(afternoon)}` : 'Tarde sem medição'}</small>
          </div>
        </article>;
      })}
    </div>
  </section>;
}

type RecoveryRow = { label: string; morning: number | null; afternoon: number | null };

function UnknownIndividualRecovery({ capture, action, onCancel, onContinue }: {
  capture: CaptureRow;
  action: CaptureActionRow;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const [date, setDate] = useState('');
  const [groupId, setGroupId] = useState('');
  const [groups, setGroups] = useState<Array<{ id: string; name: string; active: boolean; milkingRoutine: string }>>([]);
  const [rows, setRows] = useState<RecoveryRow[]>([{ label: '', morning: null, afternoon: null }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const documents = capture.documents ?? [];
  const dirty = Boolean(date || groupId || rows.some((row) => row.label.trim() || row.morning !== null || row.afternoon !== null));
  useUnsavedGuard(dirty && !busy);

  useEffect(() => {
    let cancelled = false;
    void api<typeof groups>('/api/herd-groups').then((loaded) => {
      if (!cancelled) setGroups(loaded.filter((group) => group.active && group.milkingRoutine !== 'NOT_MILKED'));
    }).catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os lotes.');
    });
    return () => { cancelled = true; };
  }, []);

  function updateRow(index: number, value: Partial<RecoveryRow>) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...value } : row));
  }

  async function continueToReview() {
    const validRows = rows.filter((row) => row.label.trim() && (row.morning !== null || row.afternoon !== null));
    if (!date || !groupId || !validRows.length) {
      setError('Informe data, lote e pelo menos uma vaca com um valor de leite.');
      return;
    }
    setBusy(true);
    setError('');
    const imported = {
      sessionDate: date,
      herdGroupId: groupId,
      herdGroupLabel: groups.find((group) => group.id === groupId)?.name ?? null,
      sourceMode: 'SEPARATE_MORNING_AFTERNOON' as const,
      period: null,
      sourceDocumentOrdinals: documents.map((document) => document.ordinal),
      metadataReview: { dateRequired: false, groupRequired: false, periodRequired: false },
      measurements: validRows.map((row) => ({
        rawAnimalLabel: row.label.trim(),
        rawValueText: null,
        morningLiters: row.morning,
        afternoonLiters: row.afternoon,
        totalLiters: (row.morning ?? 0) + (row.afternoon ?? 0),
        confidence: 'MEDIUM' as const,
        excluded: false,
        notes: 'Consolidado manualmente a partir da captura original.',
      })),
    };
    try {
      await api(`/api/captures/${capture.id}/actions/${action.id}/reclassify-individual`, json('POST', { import: imported }));
      onContinue();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível preparar a revisão.');
      setBusy(false);
    }
  }

  return <div className="game-notebook-recovery">
    <button type="button" className="game-sheet-back" onClick={onCancel}><ArrowLeft size={16} aria-hidden />Voltar ao detalhe</button>
    <div className="mb-3">
      <strong className="text-lg">Organizar como controle individual</strong>
      <p className="game-notebook-subtitle">A IA não conseguiu classificar esta leitura. Confira a fonte e informe os valores; depois você ainda revisará cada linha antes de salvar.</p>
    </div>
    {documents.length > 0 && <section className="game-notebook-recovery-sources" aria-label="Fontes originais">
      {documents.map((document) => <article key={document.ordinal}>
        <strong>Foto {document.ordinal} · {document.originalFilename}</strong>
        {document.storageWarning ? <p className="text-xs">{document.storageWarning}</p> : document.attachmentId && document.mimeType.startsWith('image/')
          ? <img src={`/api/attachments/${document.attachmentId}/file`} alt={`Fonte original da foto ${document.ordinal}`} />
          : <p className="text-xs">Fonte original sem visualização disponível.</p>}
      </article>)}
    </section>}
    <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void continueToReview(); }}>
      <Field label="Data do controle"><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
      <Field label="Lote"><Select value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="">Selecione o lote</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</Select></Field>
      <div className="grid gap-2" aria-label="Linhas do controle individual">
        {rows.map((row, index) => <div className="game-notebook-recovery-row" key={index}>
          <Field label={`Vaca ${index + 1}`}><Input value={row.label} placeholder="Nome ou brinco" onChange={(event) => updateRow(index, { label: event.target.value })} /></Field>
          <Field label="Manhã (L)"><ParsedDecimalInput suffix="L" value={row.morning} onValueChange={(value) => updateRow(index, { morning: value })} /></Field>
          <Field label="Tarde (L)"><ParsedDecimalInput suffix="L" value={row.afternoon} onValueChange={(value) => updateRow(index, { afternoon: value })} /></Field>
          {rows.length > 1 && <Button type="button" variant="secondary" onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}>Remover linha</Button>}
        </div>)}
      </div>
      <Button type="button" variant="secondary" onClick={() => setRows((current) => [...current, { label: '', morning: null, afternoon: null }])}>Adicionar vaca</Button>
      {error && <ErrorState message={error} />}
      <SubmitBar label="Continuar para revisar as medições" busy={busy} disabled={!date || !groupId || !rows.some((row) => row.label.trim() && (row.morning !== null || row.afternoon !== null))} />
    </form>
  </div>;
}

/**
 * Pendência do assistente no caderno: abre a revisão na folha do fato (modo
 * revisão contextual — fase 5). Fala não reconhecida (UNKNOWN) oferece uma
 * recuperação humana que mantém a fonte e reentra na revisão do controle.
 */
function CaptureActionNotebookDetail({ capture, action, onBack, onOpenReview, onChanged }: {
  capture: CaptureRow;
  action: CaptureActionRow;
  onBack: () => void;
  onOpenReview: (captureId: string, actionId: string) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'detail' | 'recover'>('detail');
  const info = describeDetail({ type: 'captureAction', capture, action });
  const reviewable = action.status === 'NEEDS_REVIEW' && action.actionType !== 'UNKNOWN';
  const individual = action.actionType === 'INDIVIDUAL_MILK_SESSION';

  if (view === 'recover') return <UnknownIndividualRecovery
    capture={capture}
    action={action}
    onCancel={() => setView('detail')}
    onContinue={() => onOpenReview(capture.id, action.id)}
  />;

  async function dismiss() {
    setBusy(true);
    setError('');
    try {
      await api(`/api/captures/${capture.id}/actions/${action.id}/dismiss`, json('POST'));
      toast('Captura descartada');
      onChanged();
      onBack();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível descartar.');
      setBusy(false);
    }
  }

  return <>
    <button type="button" className="game-sheet-back" onClick={onBack}><ArrowLeft size={16} aria-hidden />Voltar à lista</button>
    <DetailHeader info={info} />
    {error && <div className="mb-3"><ErrorState message={error} /></div>}
    <div className="mb-3"><GameEntityActions actions={[
      ...(reviewable
        ? [{ icon: <ClipboardList size={22} aria-hidden />, label: individual ? 'Revisar medições na mangueira' : 'Revisar na folha', hint: individual ? 'Confira animal, manhã, tarde e vínculo antes de salvar o controle.' : 'Abre o fato preenchido pelo assistente, pronto para confirmar ou corrigir.', testid: 'game-notebook-review-open', onClick: () => onOpenReview(capture.id, action.id) }]
        : action.status === 'NEEDS_REVIEW' && action.actionType === 'UNKNOWN'
          ? [{ icon: <ClipboardList size={22} aria-hidden />, label: 'Consolidar como controle individual', hint: 'Confira a foto, informe as vacas e revise cada medição antes de salvar.', testid: 'game-notebook-review-manual-individual', onClick: () => setView('recover') }]
        : []),
      ...(action.status === 'NEEDS_REVIEW'
        ? [{ icon: <Archive size={22} aria-hidden />, label: 'Descartar captura', hint: 'Sai da fila sem virar fato.', testid: 'game-notebook-review-dismiss', onClick: () => void dismiss() }]
        : []),
      ]} /></div>
    {individual && <IndividualCapturePreview action={action} />}
    {action.actionType === 'UNKNOWN' && action.status === 'NEEDS_REVIEW' && <div className="notice notice-warning mb-3">
      <strong>Esta leitura ainda não virou um controle.</strong>
      <p className="mt-1 text-sm">A ação continuará ligada à captura original. Primeiro organize os valores; depois a revisão linha a linha confirmará o controle.</p>
    </div>}
    {busy && <p className="game-notebook-empty mt-2">Descartando…</p>}
    <DetailFields fields={info.fields} />
  </>;
}

/** Detalhe de animal: view + as mesmas ações rápidas da GameGroupSheet. */
function AnimalNotebookDetail({ animal, onBack, onChanged }: { animal: AnimalRow; onBack: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [view, setView] = useState<'menu' | 'heat' | 'status' | 'group' | 'mastite'>('menu');
  useEffect(() => setView('menu'), [animal.id]);
  const info = describeDetail({ type: 'animal', row: animal });

  function handleSaved() {
    onChanged();
    setView('menu');
  }

  if (view === 'heat') return <>
    <button type="button" className="game-sheet-back" onClick={() => setView('menu')}><ArrowLeft size={16} aria-hidden />Voltar ao detalhe</button>
    <ReproductiveEventForm animalId={animal.id} onCancel={() => setView('menu')} onSaved={handleSaved} />
  </>;
  if (view === 'status') return <>
    <button type="button" className="game-sheet-back" onClick={() => setView('menu')}><ArrowLeft size={16} aria-hidden />Voltar ao detalhe</button>
    <AnimalStatusChangeForm animalId={animal.id} currentStatus={animal.status} onCancel={() => setView('menu')} onSaved={handleSaved} />
  </>;
  if (view === 'group') return <>
    <button type="button" className="game-sheet-back" onClick={() => setView('menu')}><ArrowLeft size={16} aria-hidden />Voltar ao detalhe</button>
    <AnimalGroupChangeForm animalId={animal.id} status={animal.status} currentGroupId={animal.currentGroup?.id} onCancel={() => setView('menu')} onSaved={handleSaved} />
  </>;
  if (view === 'mastite') return <>
    <button type="button" className="game-sheet-back" onClick={() => setView('menu')}><ArrowLeft size={16} aria-hidden />Voltar ao detalhe</button>
    <MastitisCaseForm initialAnimalId={animal.id} onSaved={() => { toast('Caso de mastite registrado'); handleSaved(); }} />
  </>;

  const actions: GameEntityAction[] = [
    { icon: <HeartPulse size={22} aria-hidden />, label: 'Registrar cio/cobertura', hint: 'Fato reprodutivo observado hoje ou em outra data.', onClick: () => setView('heat') },
    ...(isLiveStatus(animal.status)
      ? [{ icon: <Plus size={22} aria-hidden />, label: 'Registrar mastite', hint: 'Sinal observado e decisão humana — nunca diagnóstico automático.', testid: 'game-notebook-animal-mastite', onClick: () => setView('mastite') }]
      : []),
    ...(allowedNextStatuses(animal.status).length > 0
      ? [{ icon: <RefreshCw size={22} aria-hidden />, label: 'Alterar situação', hint: 'Secar, parto, venda ou morte — com histórico preservado.', onClick: () => setView('status') }]
      : []),
    ...(isLiveStatus(animal.status)
      ? [{ icon: <ArrowRightLeft size={22} aria-hidden />, label: 'Mover de lote', hint: 'Mudança datada, com o histórico de lotes preservado.', onClick: () => setView('group') }]
      : []),
  ];

  return <>
    <button type="button" className="game-sheet-back" onClick={onBack}><ArrowLeft size={16} aria-hidden />Voltar à lista</button>
    <DetailHeader info={info} />
    <div className="mb-3"><GameEntityActions actions={actions} testid="game-notebook-animal-actions" /></div>
    <DetailFields fields={info.fields} />
    {info.link && <DetailLink link={info.link} />}
  </>;
}

/**
 * Lote como entidade do caderno: criar (row null), editar nome/rotina e
 * arquivar/reativar — tudo pelos endpoints reais de /api/herd-groups. Arquivar
 * um lote com animais mostra o 409 do servidor (mova os animais antes).
 */
function GroupNotebookDetail({ group, onBack, onChanged }: { group: HerdGroup | null; onBack: () => void; onChanged: () => void }) {
  const [view, setView] = useState<'menu' | 'edit'>('menu');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setView('menu'); setActionError(''); }, [group?.id]);

  async function setActive(active: boolean) {
    if (!group) return;
    setBusy(true);
    setActionError('');
    try {
      await api(`/api/herd-groups/${group.id}`, json('PATCH', { name: group.name, milkingRoutine: group.milkingRoutine, active }));
      onChanged();
      onBack();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o lote.');
    } finally {
      setBusy(false);
    }
  }

  if (!group || view === 'edit') return <>
    <button type="button" className="game-sheet-back" onClick={group ? () => setView('menu') : onBack}><ArrowLeft size={16} aria-hidden />{group ? 'Voltar ao lote' : 'Voltar à lista'}</button>
    <div className="mb-3"><strong className="text-lg">{group ? `Editar ${group.name}` : 'Novo lote'}</strong></div>
    <HerdGroupForm initial={group ?? undefined} onCancel={group ? () => setView('menu') : onBack} onSaved={() => { onChanged(); onBack(); }} />
  </>;

  return <>
    <button type="button" className="game-sheet-back" onClick={onBack}><ArrowLeft size={16} aria-hidden />Voltar à lista</button>
    <div className="mb-3">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-lg">{group.name}</strong>
        {!group.active && <StatusBadge descriptor={{ label: 'Arquivado', tone: 'neutral' }} />}
      </div>
      <p className="game-notebook-subtitle">{milkingRoutineLabels[group.milkingRoutine]} · {group.animalCount} {group.animalCount === 1 ? 'animal' : 'animais'}</p>
    </div>
    {actionError && <div className="mb-3"><ErrorState message={actionError} /></div>}
    <GameEntityActions actions={[
      { icon: <Pencil size={22} aria-hidden />, label: 'Editar lote', hint: 'Nome e rotina de ordenha.', testid: 'game-notebook-group-edit', onClick: () => setView('edit') },
      ...(group.active
        ? [{ icon: <Archive size={22} aria-hidden />, label: 'Arquivar lote', hint: 'Só é possível sem animais no lote; eles precisam ser movidos antes.', testid: 'game-notebook-group-archive', onClick: () => void setActive(false) }]
        : [{ icon: <ArchiveRestore size={22} aria-hidden />, label: 'Reativar lote', hint: 'O lote volta a aparecer nas escolhas de manejo.', testid: 'game-notebook-group-archive', onClick: () => void setActive(true) }]),
    ]} />
    {busy && <p className="game-notebook-empty mt-2">Atualizando…</p>}
  </>;
}

/**
 * Item do catálogo como entidade do caderno: saldo derivado + o editor real
 * (renomear, ativar/desativar; unidade travada após a primeira movimentação —
 * o 409 do servidor aparece no próprio editor).
 */
function FeedItemNotebookDetail({ row, onBack, onChanged }: { row: FeedInventoryRow; onBack: () => void; onChanged: () => void }) {
  const info = describeDetail({ type: 'feedItem', row });
  return <>
    <button type="button" className="game-sheet-back" onClick={onBack}><ArrowLeft size={16} aria-hidden />Voltar à lista</button>
    <DetailHeader info={info} />
    <DetailFields fields={info.fields} />
    <div className="mt-3"><CatalogItemEditor row={row} onChanged={onChanged} /></div>
    {info.link && <DetailLink link={info.link} />}
  </>;
}

function GenericNotebookDetail({ detail, onBack }: { detail: Exclude<NotebookDetail, { type: 'animal' } | { type: 'group' } | { type: 'feedItem' }>; onBack: () => void }) {
  const info = describeDetail(detail);
  return <>
    <button type="button" className="game-sheet-back" onClick={onBack}><ArrowLeft size={16} aria-hidden />Voltar à lista</button>
    <DetailHeader info={info} />
    <DetailFields fields={info.fields} />
    {info.link && <DetailLink link={info.link} />}
  </>;
}

/**
 * Caderno do sítio: a folha grande de consulta do jogo. Abas por assunto com
 * carregamento sob demanda (só bate no endpoint da aba ativa), busca global
 * client-side sobre os dados já carregados (ao digitar, todas as fontes são
 * carregadas) e detalhe da entidade dentro da própria folha — animal com as
 * mesmas ações rápidas da GameGroupSheet; demais entidades em view
 * somente-leitura com link sutil para a página do app (transicional).
 * A aba Hoje monta o `TodayPanel` (o antigo dashboard), que busca
 * `/api/dashboard` sozinho.
 */
export function GameNotebook({ open, initialTab, startInCreate, onClose, onOpenInstallation, onOpenReview, onChanged }: {
  open: boolean;
  initialTab?: NotebookTab;
  startInCreate?: boolean;
  onClose: () => void;
  onOpenInstallation: (target: NotebookSheetTarget) => void;
  onOpenReview: (captureId: string, actionId: string) => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<NotebookTab>('hoje');
  const [view, setView] = useState<'tabs' | 'create' | 'create-animal' | 'create-feed-item'>('tabs');
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<NotebookDetail | null>(null);
  // Filtro por aba (chips client-side sobre os dados já carregados).
  const [filters, setFilters] = useState<Partial<Record<NotebookTab, string>>>({});

  useEffect(() => {
    if (open) {
      setTab(initialTab ?? 'hoje');
      setView(startInCreate ? 'create' : 'tabs');
      setQuery('');
      setDetail(null);
      setFilters({});
    }
  }, [open, initialTab, startInCreate]);

  const searching = normalizeLabel(query).length > 0;

  /** Troca de aba: som de página virando (respeita unlock e mudo do jogo). */
  function handleTabChange(slug: NotebookTab) {
    if (slug === tab) return;
    gameAudio.play('pageTurn');
    setTab(slug);
  }

  const filterOf = (slug: NotebookTab) => filters[slug] ?? 'todos';
  const setFilter = (slug: NotebookTab, value: string) => setFilters((current) => ({ ...current, [slug]: value }));

  const animals = useLazyResource<AnimalRow[]>('/api/animals', open && (tab === 'rebanho' || searching));
  const groups = useLazyResource<HerdGroup[]>('/api/herd-groups', open && (tab === 'rebanho' || searching));
  const totals = useLazyResource<DailyTotalRow[]>('/api/daily-milk-totals', open && (tab === 'producao' || searching));
  const sessions = useLazyResource<SessionRow[]>('/api/milk-sessions', open && (tab === 'producao' || searching));
  const collections = useLazyResource<CollectionRow[]>('/api/milk-collections', open && (tab === 'producao' || searching));
  const inventory = useLazyResource<FeedInventoryRow[]>('/api/feed-inventory', open && (tab === 'estoque' || searching));
  const purchases = useLazyResource<PurchaseRow[]>('/api/purchases', open && (tab === 'financeiro' || searching));
  const revenues = useLazyResource<RevenueRow[]>('/api/revenues', open && (tab === 'financeiro' || searching));
  const mastitis = useLazyResource<MastitisRow[]>('/api/mastitis-cases', open && (tab === 'saude' || tab === 'pendencias' || searching));
  const captures = useLazyResource<CaptureRow[]>('/api/captures', open && (tab === 'pendencias' || searching));
  // Marcadores do mundo: a mesma projeção derivada de /api/game/state.
  const gameState = useLazyResource<GameState>('/api/game/state', open && tab === 'pendencias' && !searching);

  const pendingActions = useMemo(() => (captures.data ?? []).flatMap((capture) =>
    capture.actions.filter((action) => action.status === 'NEEDS_REVIEW').map((action) => ({ capture, action })),
  ), [captures.data]);

  // Casos abertos com carência informada (derivado: dias restantes/atraso do servidor).
  const withdrawalCases = useMemo(() => (mastitis.data ?? []).filter((row) =>
    !['RESOLVED', 'CANCELLED'].includes(row.status) && row.withdrawalEndsAt,
  ), [mastitis.data]);

  /** Tocar num marcador abre a mesma folha que o marcador no mundo abriria. */
  function markerTarget(marker: GameMarker): NotebookSheetTarget {
    if (marker.kind === 'COLLECTION_MISSING') return 'MANGUEIRA';
    if (marker.kind === 'PURCHASE_OVERDUE') return 'CASA';
    return 'PLOT';
  }

  // Entradas da busca global: tudo o que já foi carregado, com texto
  // normalizado (mesma normalização do casamento de rótulos do domínio).
  const searchEntries = useMemo(() => {
    const entries: { group: string; detail: NotebookDetail; title: string; subtitle: string; badge?: StatusDescriptor; haystack: string }[] = [];
    for (const row of animals.data ?? []) {
      const title = displayName(row);
      const subtitle = animalListSubtitle(row);
      entries.push({ group: 'Animais', detail: { type: 'animal', row }, title, subtitle, badge: animalStatusDescriptor(row.status), haystack: normalizeLabel(`${title} ${row.tagNumber ?? ''} ${row.aliases.map((alias) => alias.alias).join(' ')}`) });
    }
    for (const row of totals.data ?? []) entries.push({ group: 'Produção', detail: { type: 'dailyTotal', row }, title: `Produção de ${dateOf(row.productionDate)}`, subtitle: row.herdGroupName ?? 'Rebanho todo', haystack: normalizeLabel(`producao ${row.productionDate} ${row.herdGroupName ?? 'rebanho todo'}`) });
    for (const row of sessions.data ?? []) entries.push({ group: 'Produção', detail: { type: 'session', row }, title: `Controle de ${dateOf(row.sessionDate)}`, subtitle: row.title ?? 'Controle individual', haystack: normalizeLabel(`controle ${row.sessionDate} ${row.title ?? ''}`) });
    for (const row of collections.data ?? []) entries.push({ group: 'Coletas', detail: { type: 'collection', row }, title: `Coleta de ${dateOf(row.collectionDate)}`, subtitle: `${formatLiters(row.liters)} · ${milkCollectionSourceLabel[row.source] ?? row.source}`, haystack: normalizeLabel(`coleta ${row.collectionDate}`) });
    for (const row of (inventory.data ?? []).filter((item) => item.active)) entries.push({ group: 'Estoque', detail: { type: 'feedItem', row }, title: row.name, subtitle: `Saldo ${formatFeedQuantity(row.balance, row.canonicalUnit)}`, haystack: normalizeLabel(row.name) });
    for (const row of purchases.data ?? []) entries.push({ group: 'Compras', detail: { type: 'purchase', row }, title: row.description, subtitle: `${dateOf(row.purchaseDate)} · ${formatMoney(row.totalAmount)}`, badge: purchaseStatusDescriptor(row.status, row.isOverdue), haystack: normalizeLabel(`${row.description} ${row.supplierName ?? ''} ${categoryLabels[row.category] ?? row.category}`) });
    for (const row of revenues.data ?? []) entries.push({ group: 'Receitas', detail: { type: 'revenue', row }, title: row.description, subtitle: `${dateOf(row.revenueDate)} · ${formatMoney(row.amount)}`, badge: revenueStatusDescriptor[row.status], haystack: normalizeLabel(`${row.description} ${row.animalName ?? ''} ${row.buyerName ?? ''} ${categoryLabels[row.category] ?? row.category}`) });
    for (const row of mastitis.data ?? []) entries.push({ group: 'Saúde', detail: { type: 'mastitis', row }, title: row.animalName ?? `Brinco ${row.tagNumber}`, subtitle: `Mastite · ${dateOf(row.detectedAt)}`, badge: mastitisStatusDescriptor[row.status], haystack: normalizeLabel(`mastite ${row.animalName ?? ''} ${row.tagNumber ?? ''}`) });
    for (const { capture, action } of pendingActions) entries.push({ group: 'Pendências', detail: { type: 'captureAction', capture, action }, title: proposedActionTypeLabel[action.actionType] ?? action.actionType, subtitle: `Recebida em ${dateOf(capture.createdAt)}`, badge: commitStatusDescriptor[action.commitStatus], haystack: normalizeLabel(`${proposedActionTypeLabel[action.actionType] ?? action.actionType} ${capture.transcript ?? ''}`) });
    return entries;
  }, [animals.data, totals.data, sessions.data, collections.data, inventory.data, purchases.data, revenues.data, mastitis.data, pendingActions]);

  const searchResults = useMemo(() => {
    if (!searching) return [];
    const needle = normalizeLabel(query);
    return searchEntries.filter((entry) => entry.haystack.includes(needle));
  }, [searching, query, searchEntries]);

  const searchGroups = useMemo(() => {
    const groups: { name: string; entries: typeof searchResults }[] = [];
    for (const entry of searchResults) {
      const group = groups.find((item) => item.name === entry.group);
      if (group) group.entries.push(entry);
      else groups.push({ name: entry.group, entries: [entry] });
    }
    return groups;
  }, [searchResults]);

  const searchLoading = searching && [animals, totals, sessions, collections, inventory, purchases, revenues, mastitis, captures].some((resource) => resource.loading && !resource.data);

  // Aba Produção: uma lista só (totais + controles + coletas), agrupada por
  // data e filtrada pelos chips — as ações ficam em cartões no topo da aba.
  const producaoRows = useMemo(() => {
    const rows: { date: string; kind: 'totais' | 'controles' | 'coletas'; detail: NotebookDetail; title: string; subtitle: string; badge?: StatusDescriptor }[] = [];
    for (const row of totals.data ?? []) rows.push({ date: row.productionDate, kind: 'totais', detail: { type: 'dailyTotal', row }, title: row.herdGroupName ? `Produção — ${row.herdGroupName}` : 'Produção do rebanho todo', subtitle: row.totalLiters !== null ? formatLiters(row.totalLiters) : '—' });
    for (const row of sessions.data ?? []) rows.push({ date: row.sessionDate, kind: 'controles', detail: { type: 'session', row }, title: row.title ?? 'Controle individual', subtitle: `${formatLiters(row.confirmedTotal)} confirmados`, badge: row.reviewCount > 0 ? { label: `${row.reviewCount} a revisar`, tone: 'warning' } : undefined });
    for (const row of collections.data ?? []) rows.push({ date: row.collectionDate, kind: 'coletas', detail: { type: 'collection', row }, title: 'Coleta do laticínio', subtitle: `${formatLiters(row.liters)} · ${milkCollectionSourceLabel[row.source] ?? row.source}` });
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [totals.data, sessions.data, collections.data]);

  const producaoGroups = useMemo(() => {
    const filter = filterOf('producao');
    const groups: { date: string; rows: typeof producaoRows }[] = [];
    for (const row of producaoRows) {
      if (filter !== 'todos' && row.kind !== filter) continue;
      const group = groups.find((item) => item.date === row.date);
      if (group) group.rows.push(row);
      else groups.push({ date: row.date, rows: [row] });
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producaoRows, filters]);

  const producaoLoading = [totals, sessions, collections].some((resource) => resource.loading && !resource.data);
  const producaoError = totals.error || sessions.error || collections.error;

  // Aba Estoque: chips Todos / Em falta (ativo com saldo zerado) / Inativos.
  const visibleInventory = useMemo(() => {
    const filter = filterOf('estoque');
    return (inventory.data ?? []).filter((row) => {
      if (filter === 'em-falta') return row.active && row.balance <= 0;
      if (filter === 'inativos') return !row.active;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventory.data, filters]);

  // Aba Financeiro: chips Todos / A pagar / A receber / Pagas (quitadas).
  const visiblePurchases = useMemo(() => {
    const filter = filterOf('financeiro');
    return (purchases.data ?? []).filter((row) => {
      if (filter === 'a-pagar') return row.status === 'OPEN';
      if (filter === 'pagas') return row.status === 'PAID';
      if (filter === 'a-receber') return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchases.data, filters]);

  const visibleRevenues = useMemo(() => {
    const filter = filterOf('financeiro');
    return (revenues.data ?? []).filter((row) => {
      if (filter === 'a-receber') return row.status === 'EXPECTED';
      if (filter === 'pagas') return row.status === 'RECEIVED';
      if (filter === 'a-pagar') return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revenues.data, filters]);

  // Aba Saúde: chips Todos / Abertos / Encerrados.
  const visibleMastitis = useMemo(() => {
    const filter = filterOf('saude');
    return (mastitis.data ?? []).filter((row) => {
      const open = !['RESOLVED', 'CANCELLED'].includes(row.status);
      if (filter === 'abertos') return open;
      if (filter === 'encerrados') return !open;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mastitis.data, filters]);

  // Aba Rebanho: com vários lotes ativos, chips filtram os animais por lote.
  const activeGroups = useMemo(() => (groups.data ?? []).filter((group) => group.active), [groups.data]);
  const visibleAnimals = useMemo(() => {
    const filter = filterOf('rebanho');
    return (animals.data ?? []).filter((row) => filter === 'todos' || row.currentGroup?.id === filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animals.data, filters]);

  function handleAnimalChanged() {
    animals.reload();
    groups.reload();
    onChanged();
  }

  const createActions: GameEntityAction[] = [
    { icon: <Milk size={22} aria-hidden />, label: 'Produção do dia', hint: 'Total de leite registrado na mangueira.', testid: 'game-notebook-create-producao', onClick: () => onOpenInstallation('MANGUEIRA') },
    { icon: <Truck size={22} aria-hidden />, label: 'Coleta do laticínio', hint: 'Saída do leite pelo caminhão, na mangueira.', testid: 'game-notebook-create-coleta', onClick: () => onOpenInstallation('MANGUEIRA') },
    { icon: <Wheat size={22} aria-hidden />, label: 'Trato', hint: 'Alimentação registrada no cocho.', testid: 'game-notebook-create-trato', onClick: () => onOpenInstallation('ESTACAO_ALIMENTACAO') },
    { icon: <ShoppingCart size={22} aria-hidden />, label: 'Compra', hint: 'Pela vitrine da Loja do sítio.', testid: 'game-notebook-create-compra', onClick: () => onOpenInstallation('LOJA') },
    { icon: <Sprout size={22} aria-hidden />, label: 'Plantio', hint: 'Novo ciclo num talhão desenhado no mapa.', testid: 'game-notebook-create-plantio', onClick: () => onOpenInstallation('PLOT') },
    { icon: <Beef size={22} aria-hidden />, label: 'Animal', hint: 'Cadastro individual completo, sem sair do mapa.', testid: 'game-notebook-create-animal', onClick: () => setView('create-animal') },
  ];

  return <GameSheet open={open} label="Caderno do sítio" testid="game-notebook" className="game-notebook" title="Caderno" subtitle="O sítio inteiro em listas e buscas." onClose={onClose} sprite={<NotebookSprite />}>
    <div className="game-sheet-body">
      <div className="game-notebook-search">
        <Search size={17} aria-hidden />
        <input data-testid="game-notebook-search" value={query} onChange={(event) => { setQuery(event.target.value); setDetail(null); }} placeholder="Buscar no caderno…" aria-label="Buscar no caderno" />
      </div>

      {detail && <div className="game-notebook-scroll" data-testid="game-notebook-detail">
        {detail.type === 'animal'
          ? <AnimalNotebookDetail animal={detail.row} onBack={() => setDetail(null)} onChanged={handleAnimalChanged} />
          : detail.type === 'group'
            ? <GroupNotebookDetail group={detail.row} onBack={() => setDetail(null)} onChanged={() => { groups.reload(); onChanged(); }} />
            : detail.type === 'feedItem'
              ? <FeedItemNotebookDetail row={detail.row} onBack={() => setDetail(null)} onChanged={() => { inventory.reload(); onChanged(); }} />
              : detail.type === 'captureAction'
                ? <CaptureActionNotebookDetail capture={detail.capture} action={detail.action} onBack={() => setDetail(null)} onOpenReview={onOpenReview} onChanged={() => { captures.reload(); onChanged(); }} />
                : <GenericNotebookDetail detail={detail} onBack={() => setDetail(null)} />}
      </div>}

      {!detail && view === 'create-animal' && <div className="game-notebook-scroll">
        <button type="button" className="game-sheet-back" onClick={() => setView('tabs')}><ArrowLeft size={16} aria-hidden />Voltar ao caderno</button>
        <div className="mb-3"><strong className="text-lg">Cadastrar animal</strong></div>
        <AnimalForm onSaved={() => { handleAnimalChanged(); setView('tabs'); }} />
      </div>}

      {!detail && view === 'create-feed-item' && <div className="game-notebook-scroll">
        <button type="button" className="game-sheet-back" onClick={() => setView('tabs')}><ArrowLeft size={16} aria-hidden />Voltar ao estoque</button>
        <div className="mb-3"><strong className="text-lg">Novo item do catálogo</strong></div>
        <FeedItemForm onSaved={() => { inventory.reload(); onChanged(); setView('tabs'); }} />
      </div>}

      {!detail && view === 'create' && <div className="game-notebook-scroll">
        <button type="button" className="game-sheet-back" onClick={() => setView('tabs')}><ArrowLeft size={16} aria-hidden />Voltar ao caderno</button>
        <GameEntityActions actions={createActions} testid="game-notebook-create" />
      </div>}

      {!detail && view === 'tabs' && searching && <div className="game-notebook-scroll">
        {searchLoading && <SkeletonList rows={3} />}
        {!searchLoading && !searchResults.length && <p className="game-notebook-empty">Nada encontrado para “{query.trim()}”.</p>}
        {!searchLoading && searchGroups.map((group) => <div key={group.name} className="mb-3"><NotebookSection title={group.name}>
          {group.entries.map((entry) => <NotebookRow key={`${entry.detail.type}-${detailId(entry.detail)}`} detail={entry.detail} title={entry.title} subtitle={entry.subtitle} badge={entry.badge} onOpen={setDetail} />)}
        </NotebookSection></div>)}
      </div>}
      {!detail && view === 'tabs' && !searching && <>
        <nav className="game-notebook-tabs" role="tablist" aria-label="Assuntos do caderno">
          {TABS.map((item) => <button key={item.slug} type="button" role="tab" aria-selected={tab === item.slug} data-active={tab === item.slug} data-testid={`game-notebook-tab-${item.slug}`} className="game-notebook-tab" onClick={() => handleTabChange(item.slug)}>
            {item.icon}{item.label}
          </button>)}
        </nav>

        <div className="game-notebook-scroll">
        {tab === 'hoje' && <TodayPanel />}

        {tab === 'rebanho' && <div className="grid gap-4">
          <NotebookSection title="Lotes">
            <button type="button" className="game-sheet-action" data-testid="game-notebook-group-create" onClick={() => setDetail({ type: 'group', row: null })}>
              <Plus size={22} aria-hidden />
              <span><strong>Criar lote</strong><small>Nome e rotina de ordenha (manhã+tarde, só manhã ou sem ordenha).</small></span>
            </button>
            <NotebookPanel state={groups} empty="Nenhum lote cadastrado ainda.">{(rows) => <>
              {rows.map((row) => <NotebookRow key={row.id} detail={{ type: 'group', row }} title={row.name} subtitle={`${milkingRoutineLabels[row.milkingRoutine]} · ${row.animalCount} ${row.animalCount === 1 ? 'animal' : 'animais'}`} badge={row.active ? undefined : { label: 'Arquivado', tone: 'neutral' }} onOpen={setDetail} />)}
            </>}</NotebookPanel>
          </NotebookSection>
          <NotebookSection title="Animais">
            {activeGroups.length >= 2 && <FilterChips label="Filtrar animais por lote" testidPrefix="game-notebook-rebanho-filter" value={filterOf('rebanho')} onChange={(slug) => setFilter('rebanho', slug)} options={[{ slug: 'todos', label: 'Todos os lotes' }, ...activeGroups.map((group) => ({ slug: group.id, label: group.name }))]} />}
            <NotebookPanel state={{ ...animals, data: visibleAnimals }} empty={(animals.data ?? []).length ? 'Nenhum animal neste lote.' : 'Nenhum animal cadastrado ainda.'}>{(rows) => <>
            {rows.map((row) => <NotebookRow key={row.id} detail={{ type: 'animal', row }} title={displayName(row)} subtitle={animalListSubtitle(row)} badge={animalStatusDescriptor(row.status)} onOpen={setDetail} />)}
          </>}</NotebookPanel></NotebookSection>
        </div>}

        {tab === 'producao' && <div className="grid gap-4">
          <GameEntityActions testid="game-notebook-producao-actions" actions={[
            { icon: <Droplets size={22} aria-hidden />, label: 'Registrar produção do dia', hint: 'Quantos litros saíram hoje, na mangueira.', testid: 'game-notebook-producao-action-total', onClick: () => onOpenInstallation('MANGUEIRA_PRODUCAO') },
            { icon: <Truck size={22} aria-hidden />, label: 'Registrar coleta', hint: 'O caminhão do laticínio levou leite do tanque.', testid: 'game-notebook-producao-action-coleta', onClick: () => onOpenInstallation('MANGUEIRA_COLETA') },
            { icon: <ClipboardList size={22} aria-hidden />, label: 'Controle individual', hint: 'Medir vaca por vaca, com avanço automático.', testid: 'game-notebook-producao-action-individual', onClick: () => onOpenInstallation('MANGUEIRA_INDIVIDUAL') },
          ]} />
          <div>
            <FilterChips label="Filtrar registros de produção" testidPrefix="game-notebook-producao-filter" value={filterOf('producao')} onChange={(slug) => setFilter('producao', slug)} options={[
              { slug: 'todos', label: 'Todos' },
              { slug: 'totais', label: 'Totais' },
              { slug: 'controles', label: 'Controles' },
              { slug: 'coletas', label: 'Coletas' },
            ]} />
            {producaoLoading && <SkeletonList rows={3} />}
            {producaoError && <ErrorState message={producaoError} retry={() => { totals.reload(); sessions.reload(); collections.reload(); }} />}
            {!producaoLoading && !producaoError && !producaoGroups.length && <p className="game-notebook-empty">{producaoRows.length ? 'Nenhum registro neste filtro.' : 'Nenhum registro de produção ainda.'}</p>}
            {!producaoLoading && !producaoError && producaoGroups.map((group) => <div key={group.date} className="mb-3"><NotebookSection title={formatDate(group.date)}>
              {group.rows.map((row) => <NotebookRow key={`${row.detail.type}-${detailId(row.detail)}`} detail={row.detail} title={row.title} subtitle={row.subtitle} badge={row.badge} onOpen={setDetail} />)}
            </NotebookSection></div>)}
          </div>
        </div>}

        {tab === 'estoque' && <div className="grid gap-4">
          <button type="button" className="game-sheet-action" data-testid="game-notebook-feeditem-create" onClick={() => setView('create-feed-item')}>
            <PackagePlus size={22} aria-hidden />
            <span><strong>Novo item do catálogo</strong><small>Nome e unidade de controle (kg, litros ou unidades).</small></span>
          </button>
          <div>
            <FilterChips label="Filtrar estoque" testidPrefix="game-notebook-estoque-filter" value={filterOf('estoque')} onChange={(slug) => setFilter('estoque', slug)} options={[
              { slug: 'todos', label: 'Todos' },
              { slug: 'em-falta', label: 'Em falta' },
              { slug: 'inativos', label: 'Inativos' },
            ]} />
            <NotebookPanel state={{ ...inventory, data: visibleInventory }} empty={(inventory.data ?? []).length ? 'Nenhum item neste filtro.' : 'Estoque vazio. Compre na Loja para encher o depósito.'}>{(rows) => <div className="grid gap-2">
              {rows.map((row) => <NotebookRow key={row.feedItemId} detail={{ type: 'feedItem', row }} title={row.name} subtitle={`Saldo ${formatFeedQuantity(row.balance, row.canonicalUnit)}`} badge={row.active ? undefined : { label: 'Inativo', tone: 'neutral' }} onOpen={setDetail} />)}
            </div>}</NotebookPanel>
          </div>
        </div>}

        {tab === 'financeiro' && <div className="grid gap-4">
          <FilterChips label="Filtrar financeiro" testidPrefix="game-notebook-financeiro-filter" value={filterOf('financeiro')} onChange={(slug) => setFilter('financeiro', slug)} options={[
            { slug: 'todos', label: 'Todos' },
            { slug: 'a-pagar', label: 'A pagar' },
            { slug: 'a-receber', label: 'A receber' },
            { slug: 'pagas', label: 'Pagas' },
          ]} />
          {filterOf('financeiro') !== 'a-receber' && <NotebookSection title="Compras"><NotebookPanel state={{ ...purchases, data: visiblePurchases }} empty={(purchases.data ?? []).length ? 'Nenhuma compra neste filtro.' : 'Nenhuma compra registrada.'}>{(rows) => <>
            {rows.map((row) => <NotebookRow key={row.id} detail={{ type: 'purchase', row }} title={row.description} subtitle={`${dateOf(row.purchaseDate)} · ${formatMoney(row.totalAmount)}`} badge={purchaseStatusDescriptor(row.status, row.isOverdue)} onOpen={setDetail} />)}
          </>}</NotebookPanel></NotebookSection>}
          {filterOf('financeiro') !== 'a-pagar' && <NotebookSection title="Receitas"><NotebookPanel state={{ ...revenues, data: visibleRevenues }} empty={(revenues.data ?? []).length ? 'Nenhuma receita neste filtro.' : 'Nenhuma receita registrada.'}>{(rows) => <>
            {rows.map((row) => <NotebookRow key={row.id} detail={{ type: 'revenue', row }} title={row.description} subtitle={`${dateOf(row.revenueDate)} · ${formatMoney(row.amount)}`} badge={revenueStatusDescriptor[row.status]} onOpen={setDetail} />)}
          </>}</NotebookPanel></NotebookSection>}
        </div>}

        {tab === 'saude' && <div>
          <FilterChips label="Filtrar casos de mastite" testidPrefix="game-notebook-saude-filter" value={filterOf('saude')} onChange={(slug) => setFilter('saude', slug)} options={[
            { slug: 'todos', label: 'Todos' },
            { slug: 'abertos', label: 'Abertos' },
            { slug: 'encerrados', label: 'Encerrados' },
          ]} />
          <NotebookPanel state={{ ...mastitis, data: visibleMastitis }} empty={(mastitis.data ?? []).length ? 'Nenhum caso neste filtro.' : 'Nenhum caso de mastite registrado.'}>{(rows) => <div className="grid gap-2">
            {rows.map((row) => <NotebookRow key={row.id} detail={{ type: 'mastitis', row }} title={row.animalName ?? `Brinco ${row.tagNumber}`} subtitle={`Mastite · ${dateOf(row.detectedAt)}`} badge={mastitisStatusDescriptor[row.status]} onOpen={setDetail} />)}
          </div>}</NotebookPanel>
        </div>}

        {tab === 'pendencias' && <div className="grid gap-4">
          <NotebookSection title="Pendências do sítio">
            {gameState.loading && !gameState.data && <SkeletonList rows={2} />}
            {gameState.error && <ErrorState message={gameState.error} retry={gameState.reload} />}
            {gameState.data && !gameState.data.markers.length && <p className="game-notebook-empty">Nenhuma pendência derivada no mundo agora.</p>}
            {(gameState.data?.markers ?? []).map((marker) => <button key={`${marker.kind}-${marker.targetId}`} type="button" className="game-sheet-action" data-testid={`game-notebook-pending-marker-${marker.kind.toLowerCase().replaceAll('_', '-')}`} onClick={() => onOpenInstallation(markerTarget(marker))}>
              <ClipboardList size={22} aria-hidden />
              <span className="min-w-0 flex-1 text-left"><strong>{marker.label}</strong><small>Regra: {marker.rule}</small></span>
            </button>)}
          </NotebookSection>
          <NotebookSection title="Carências informadas">
            {mastitis.loading && !mastitis.data && <SkeletonList rows={2} />}
            {mastitis.error && <ErrorState message={mastitis.error} retry={mastitis.reload} />}
            {mastitis.data && !withdrawalCases.length && <p className="game-notebook-empty">Nenhum caso aberto com carência informada.</p>}
            {withdrawalCases.map((row) => <NotebookRow key={row.id} detail={{ type: 'mastitis', row }} title={row.animalName ?? `Brinco ${row.tagNumber}`} subtitle={`Carência informada até ${formatDate(row.withdrawalEndsAt ?? '')}`} badge={{ label: 'Carência', tone: 'warning' }} onOpen={setDetail} />)}
          </NotebookSection>
          <NotebookSection title="Revisão do assistente">
            {captures.loading && !captures.data && <SkeletonList rows={3} />}
            {captures.error && <ErrorState message={captures.error} retry={captures.reload} />}
            {captures.data && !pendingActions.length && <p className="game-notebook-empty">Tudo revisado. Nenhuma ação aguardando você.</p>}
            {pendingActions.map(({ capture, action }) => <NotebookRow key={action.id} detail={{ type: 'captureAction', capture, action }} title={proposedActionTypeLabel[action.actionType] ?? action.actionType} subtitle={`Recebida em ${dateOf(capture.createdAt)}${capture.transcript ? ` · ${excerpt(capture.transcript, 50)}` : ''}`} badge={commitStatusDescriptor[action.commitStatus]} onOpen={setDetail} />)}
          </NotebookSection>
        </div>}
        </div>
      </>}
    </div>
  </GameSheet>;
}

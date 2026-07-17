import { useState } from 'react';
import { Plus, Truck } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatDate, formatLiters, parseDecimal } from '../../domain/format';
import { AttachmentPanel, type Attachment } from '../components/AttachmentPanel';
import { useConfirm, useToast } from '../components/feedback-context';
import { ConfirmButton } from '../components/feedback';
import { LitersInput } from '../components/form-controls';
import { Badge, Button, EmptyState, ErrorState, Field, FormErrorSummary, Input, PageHeader, ScrollArea, SectionCard, Select, SkeletonList, SubmitBar, Textarea } from '../components/ui';
import { useForm } from '../hooks/useForm';
import { useResource } from '../hooks/useResource';
import { useSubmit } from '../hooks/useSubmit';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { api, ApiError, json } from '../lib/api';
import { today } from '../lib/labels';
import { milkCollectionSourceLabel } from '../lib/status';

type DayComparison = { productionLiters: number | null; collectedLiters: number; differenceLiters: number | null; productionBasis: 'HERD_TOTAL' | 'GROUP_SUM' | null; productionGroupCount: number };
type MilkCollection = {
  id: string;
  collectionDate: string;
  collectedAt: string | null;
  liters: string;
  source: string;
  notes: string | null;
  dayComparison: DayComparison;
};
type MilkCollectionDetail = MilkCollection & { attachments: Attachment[] };

function timeFromIso(value: string | null | undefined) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
}

function CollectionComparison({ comparison }: { comparison: DayComparison }) {
  if (comparison.productionLiters === null) {
    return <div className="notice notice-info">Coleta registrada no dia: <strong>{formatLiters(comparison.collectedLiters)}</strong><br /><span className="text-xs">Ainda não há produção do rebanho todo nem por lote registrada para comparar.</span></div>;
  }
  const productionLabel = comparison.productionBasis === 'GROUP_SUM'
    ? `Soma de ${comparison.productionGroupCount} lote(s) registrado(s)`
    : 'Produção agregada registrada (rebanho todo)';
  return <div className="notice notice-info">
    <div className="grid gap-1 sm:grid-cols-3"><span>{productionLabel}: <strong>{formatLiters(comparison.productionLiters)}</strong></span><span>Coleta registrada: <strong>{formatLiters(comparison.collectedLiters)}</strong></span><span>Diferença observada: <strong>{formatLiters(comparison.differenceLiters ?? 0)}</strong></span></div>
    <p className="mt-2 text-xs">A diferença pode envolver leite ainda no tanque, descarte, consumo, bezerros, horário da coleta ou medições de períodos diferentes.</p>
  </div>;
}

function MilkCollectionForm({ initial, onSaved }: { initial?: MilkCollectionDetail; onSaved: (collection: MilkCollection) => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const { busy, error, run } = useSubmit();
  const form = useForm(
    {
      collectionDate: initial?.collectionDate ?? today(),
      liters: initial?.liters ?? '',
      collectedTime: timeFromIso(initial?.collectedAt),
      source: initial?.source ?? 'TANK_READING',
      notes: initial?.notes ?? '',
    },
    {
      collectionDate: (value) => (value ? undefined : 'Informe a data da coleta.'),
      liters: (value) => {
        const parsed = parseDecimal(value);
        return parsed !== null && parsed > 0 ? undefined : 'Informe um volume maior que zero.';
      },
    },
  );
  useUnsavedGuard(form.dirty);

  async function persist(confirmPossibleDuplicate: boolean) {
    const { collectionDate, liters, collectedTime, source, notes } = form.values;
    const parsedLiters = parseDecimal(liters);
    if (parsedLiters === null) return;
    const collectedAt = collectedTime ? new Date(`${collectionDate}T${collectedTime}:00-03:00`).toISOString() : null;
    const path = initial ? `/api/milk-collections/${initial.id}` : '/api/milk-collections';
    try {
      const created = await api<MilkCollection>(path, json(initial ? 'PATCH' : 'POST', { collectionDate, liters: parsedLiters, collectedAt, source, notes: notes.trim() || null, confirmPossibleDuplicate }));
      toast(initial ? 'Coleta atualizada' : 'Coleta registrada');
      onSaved(created);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'POSSIBLE_DUPLICATE') {
        const accepted = await confirm({
          title: 'Possível coleta duplicada',
          description: cause.message,
          confirmLabel: 'Registrar mesmo assim',
          tone: 'primary',
        });
        if (accepted) await persist(true);
        return;
      }
      throw cause;
    }
  }

  return <form className="grid gap-4" noValidate onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(() => persist(false)); }}>
    {error && <ErrorState message={error} />}
    <FormErrorSummary errors={form.visibleErrors} />
    <SectionCard title="Registro rápido">
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Data" error={form.error('collectionDate')}><Input type="date" value={form.values.collectionDate} onChange={(event) => form.set('collectionDate', event.target.value)} onBlur={() => form.blur('collectionDate')} required /></Field><Field label="Litros retirados" error={form.error('liters')}><LitersInput value={form.values.liters} onValueChange={(value) => form.set('liters', value)} onBlur={() => form.blur('liters')} placeholder="Ex.: 360" required autoFocus /></Field></div>
    </SectionCard>
    <details className="section-card" open={Boolean(initial?.collectedAt || initial?.notes)}><summary className="min-h-11 cursor-pointer py-2 text-lg font-bold">Mais detalhes</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Horário (opcional)"><Input type="time" value={form.values.collectedTime} onChange={(event) => form.set('collectedTime', event.target.value)} /></Field><Field label="Origem da medição"><Select value={form.values.source} onChange={(event) => form.set('source', event.target.value)}>{Object.entries(milkCollectionSourceLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field><Field label="Observação"><Textarea value={form.values.notes} onChange={(event) => form.set('notes', event.target.value)} /></Field></div></details>
    <SubmitBar label={initial ? 'Salvar alteração' : 'Registrar coleta'} busy={busy} />
  </form>;
}

export function NewMilkCollectionPage() {
  const navigate = useNavigate();
  return <div className="page"><div className="page-narrow"><PageHeader icon={Truck} title="Registrar coleta" subtitle="Data e litros são suficientes; os detalhes podem ser informados depois" /><MilkCollectionForm onSaved={(collection) => navigate(`/producao/coletas/${collection.id}`, { replace: true })} /></div></div>;
}

export function MilkCollectionDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useResource<MilkCollectionDetail>(`/api/milk-collections/${id}`);
  const [editing, setEditing] = useState(false);
  const [actionError, setActionError] = useState('');
  async function remove() {
    setActionError('');
    try { await api(`/api/milk-collections/${id}`, { method: 'DELETE' }); navigate('/producao', { replace: true }); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível excluir a coleta.'); }
  }
  if (loading) return <div className="page"><SkeletonList rows={4} /></div>;
  if (error || !data) return <div className="page"><ErrorState message={error || 'Coleta não encontrada.'} retry={reload} /></div>;
  if (editing) return <div className="page"><div className="page-narrow"><PageHeader icon={Truck} title="Editar coleta" action={<Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>} /><MilkCollectionForm initial={data} onSaved={async () => { await reload(); setEditing(false); }} /></div></div>;
  return <div className="page"><PageHeader icon={Truck} title={`Coleta de ${formatDate(data.collectionDate)}`} action={<Button onClick={() => setEditing(true)}>Editar</Button>} />
    <div className="grid gap-5">{actionError && <ErrorState message={actionError} />}<SectionCard><div className="flex items-start justify-between gap-4"><div><p className="text-sm text-[var(--muted)]">Volume retirado</p><p className="text-3xl font-bold">{formatLiters(data.liters)}</p><p className="mt-2 text-sm">{milkCollectionSourceLabel[data.source]}{data.collectedAt ? ` · ${timeFromIso(data.collectedAt)}` : ''}</p>{data.notes && <p className="mt-2 text-sm text-[var(--muted)]">{data.notes}</p>}</div><Badge tone="success">Registrada</Badge></div></SectionCard>
      <CollectionComparison comparison={data.dayComparison} />
      <SectionCard title="Documento da coleta"><AttachmentPanel attachments={data.attachments} milkCollectionId={id} onChange={reload} /></SectionCard>
      <SectionCard title="Excluir registro"><p className="mb-3 text-sm text-[var(--muted)]">Documentos vinculados devem ser excluídos primeiro.</p><ConfirmButton variant="danger" question="Excluir esta coleta?" onClick={() => void remove()}>Excluir coleta</ConfirmButton></SectionCard>
    </div>
  </div>;
}

export function MilkCollectionsPanel() {
  const { data, loading, error, reload } = useResource<MilkCollection[]>('/api/milk-collections');
  return <section className="min-w-0"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-xl font-bold">Coletas</h2><p className="text-sm text-[var(--muted)]">Volume efetivamente retirado pelo laticínio</p></div><Link className="button button-primary" to="/producao/coletas/nova"><Plus size={18} aria-hidden />Registrar coleta</Link></div>
    {loading ? <SkeletonList rows={4} /> : error ? <ErrorState message={error} retry={reload} /> : !data?.length ? <EmptyState title="Nenhuma coleta registrada" description="Registre o volume retirado pelo caminhão sem alterar a produção do dia." action={<Link className="button button-primary" to="/producao/coletas/nova">Registrar primeira coleta</Link>} /> : <SectionCard><ScrollArea label="Coletas recentes">{data.slice(0, 20).map((collection) => <Link className="mobile-item" key={collection.id} to={`/producao/coletas/${collection.id}`}><span className="min-w-0"><strong className="block">{formatDate(collection.collectionDate)}</strong><span className="block text-xs text-[var(--muted)]">{milkCollectionSourceLabel[collection.source]}{collection.collectedAt ? ` · ${timeFromIso(collection.collectedAt)}` : ''}</span></span><span className="text-right"><strong className="block">{formatLiters(collection.liters)}</strong>{collection.dayComparison.differenceLiters !== null && <span className="block text-xs text-[var(--muted)]">Diferença {formatLiters(collection.dayComparison.differenceLiters)}</span>}</span></Link>)}</ScrollArea></SectionCard>}
  </section>;
}

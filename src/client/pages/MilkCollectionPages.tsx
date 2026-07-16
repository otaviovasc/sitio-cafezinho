import { FormEvent, useState } from 'react';
import { Plus, Truck } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatDate, formatLiters, parseDecimal } from '../../domain/format';
import { AttachmentPanel, type Attachment } from '../components/AttachmentPanel';
import { useConfirm, useToast } from '../components/feedback-context';
import { ConfirmButton } from '../components/feedback';
import { LitersInput } from '../components/form-controls';
import { Badge, Button, EmptyState, ErrorState, Field, FormErrorSummary, Input, LoadingState, PageHeader, ScrollArea, SectionCard, Select, Textarea } from '../components/ui';
import { useResource } from '../hooks/useResource';
import { api, ApiError, json } from '../lib/api';
import { today } from '../lib/labels';

const sourceLabels: Record<string, string> = {
  DRIVER_READING: 'Leitura do caminhoneiro',
  TANK_READING: 'Leitura do tanque',
  RECEIPT: 'Comprovante',
  OTHER: 'Outra origem',
};

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
  const [collectionDate, setCollectionDate] = useState(initial?.collectionDate ?? today());
  const [liters, setLiters] = useState(initial?.liters ?? '');
  const [collectedTime, setCollectedTime] = useState(timeFromIso(initial?.collectedAt));
  const [source, setSource] = useState(initial?.source ?? 'TANK_READING');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ date?: string; liters?: string }>({});

  async function persist(confirmPossibleDuplicate: boolean) {
    const parsedLiters = parseDecimal(liters);
    const nextErrors = {
      date: collectionDate ? undefined : 'Informe a data da coleta.',
      liters: parsedLiters === null || parsedLiters <= 0 ? 'Informe um volume maior que zero.' : undefined,
    };
    setFieldErrors(nextErrors);
    if (nextErrors.date || nextErrors.liters || parsedLiters === null) return;
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
        if (accepted) {
          await persist(true);
          return;
        }
      }
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a coleta.');
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await persist(false); } finally { setBusy(false); }
  }

  return <form className="grid gap-4" noValidate onSubmit={(event) => void save(event)}>
    {error && <ErrorState message={error} />}
    <FormErrorSummary errors={Object.values(fieldErrors)} />
    <SectionCard title="Registro rápido">
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Data" error={fieldErrors.date}><Input type="date" value={collectionDate} onChange={(event) => { setCollectionDate(event.target.value); setFieldErrors((current) => ({ ...current, date: undefined })); }} required /></Field><Field label="Litros retirados" error={fieldErrors.liters}><LitersInput value={liters} onValueChange={(value) => { setLiters(value); setFieldErrors((current) => ({ ...current, liters: undefined })); }} placeholder="Ex.: 360" required autoFocus /></Field></div>
    </SectionCard>
    <details className="section-card" open={Boolean(initial?.collectedAt || initial?.notes)}><summary className="min-h-11 cursor-pointer py-2 text-lg font-bold">Mais detalhes</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Horário (opcional)"><Input type="time" value={collectedTime} onChange={(event) => setCollectedTime(event.target.value)} /></Field><Field label="Origem da medição"><Select value={source} onChange={(event) => setSource(event.target.value)}>{Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field><Field label="Observação"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field></div></details>
    <Button className="w-full sm:w-auto sm:self-start" type="submit" disabled={busy}>{busy ? 'Salvando…' : initial ? 'Salvar alteração' : 'Registrar coleta'}</Button>
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
  if (loading) return <div className="page"><LoadingState /></div>;
  if (error || !data) return <div className="page"><ErrorState message={error || 'Coleta não encontrada.'} retry={reload} /></div>;
  if (editing) return <div className="page"><div className="page-narrow"><PageHeader icon={Truck} title="Editar coleta" action={<Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>} /><MilkCollectionForm initial={data} onSaved={async () => { await reload(); setEditing(false); }} /></div></div>;
  return <div className="page"><PageHeader icon={Truck} title={`Coleta de ${formatDate(data.collectionDate)}`} action={<Button onClick={() => setEditing(true)}>Editar</Button>} />
    <div className="grid gap-5">{actionError && <ErrorState message={actionError} />}<SectionCard><div className="flex items-start justify-between gap-4"><div><p className="text-sm text-[var(--muted)]">Volume retirado</p><p className="text-3xl font-bold">{formatLiters(data.liters)}</p><p className="mt-2 text-sm">{sourceLabels[data.source]}{data.collectedAt ? ` · ${timeFromIso(data.collectedAt)}` : ''}</p>{data.notes && <p className="mt-2 text-sm text-[var(--muted)]">{data.notes}</p>}</div><Badge tone="success">Registrada</Badge></div></SectionCard>
      <CollectionComparison comparison={data.dayComparison} />
      <SectionCard title="Documento da coleta"><AttachmentPanel attachments={data.attachments} milkCollectionId={id} onChange={reload} /></SectionCard>
      <SectionCard title="Excluir registro"><p className="mb-3 text-sm text-[var(--muted)]">Documentos vinculados devem ser excluídos primeiro.</p><ConfirmButton variant="danger" question="Excluir esta coleta?" onClick={() => void remove()}>Excluir coleta</ConfirmButton></SectionCard>
    </div>
  </div>;
}

export function MilkCollectionsPanel() {
  const { data, loading, error, reload } = useResource<MilkCollection[]>('/api/milk-collections');
  return <section className="min-w-0"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-xl font-bold">Coletas</h2><p className="text-sm text-[var(--muted)]">Volume efetivamente retirado pelo laticínio</p></div><Link className="button button-primary" to="/producao/coletas/nova"><Plus size={18} aria-hidden />Registrar coleta</Link></div>
    {loading ? <LoadingState /> : error ? <ErrorState message={error} retry={reload} /> : !data?.length ? <EmptyState title="Nenhuma coleta registrada" description="Registre o volume retirado pelo caminhão sem alterar a produção do dia." action={<Link className="button button-primary" to="/producao/coletas/nova">Registrar primeira coleta</Link>} /> : <SectionCard><ScrollArea label="Coletas recentes">{data.slice(0, 20).map((collection) => <Link className="mobile-item" key={collection.id} to={`/producao/coletas/${collection.id}`}><span className="min-w-0"><strong className="block">{formatDate(collection.collectionDate)}</strong><span className="block text-xs text-[var(--muted)]">{sourceLabels[collection.source]}{collection.collectedAt ? ` · ${timeFromIso(collection.collectedAt)}` : ''}</span></span><span className="text-right"><strong className="block">{formatLiters(collection.liters)}</strong>{collection.dayComparison.differenceLiters !== null && <span className="block text-xs text-[var(--muted)]">Diferença {formatLiters(collection.dayComparison.differenceLiters)}</span>}</span></Link>)}</ScrollArea></SectionCard>}
  </section>;
}

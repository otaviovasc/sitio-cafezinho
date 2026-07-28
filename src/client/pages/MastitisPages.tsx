import { useState } from 'react';
import { Activity, Plus } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { formatDate } from '../../domain/format';
import { Badge, Button, EmptyState, ErrorState, PageHeader, ScrollArea, SectionCard, SkeletonList, StatusBadge } from '../components/ui';
import { useResource } from '../hooks/useResource';
import { MastitisActions, MastitisCaseForm, WithdrawalNotice, type MastitisCase, type MastitisCaseDetail } from '../features/health/mastitis';
import { dateFromTimestamp, mastitisAnimalName } from '../features/health/mastitis-utils';
import { mastitisOutcomeLabel, mastitisQuarterLabel, mastitisStatusDescriptor } from '../lib/status';

export function MastitisCasesPage() {
  const { data, loading, error, reload } = useResource<MastitisCase[]>('/api/mastitis-cases');
  const open = (data ?? []).filter((item) => !['RESOLVED', 'CANCELLED'].includes(item.status));
  const previous = (data ?? []).filter((item) => ['RESOLVED', 'CANCELLED'].includes(item.status));
  const list = (items: MastitisCase[]) => <ScrollArea label="Casos de mastite">{items.map((item) => <Link className="mobile-item" key={item.id} to={`/mastite/${item.id}`}><span className="min-w-0"><strong className="block">{mastitisAnimalName(item)}</strong><span className="block text-xs text-[var(--muted)]">Detectado em {formatDate(dateFromTimestamp(item.detectedAt))}</span>{item.withdrawalEndsAt && item.withdrawal && <span className="mt-1 block text-xs font-semibold text-[var(--warning)]">Carência informada até {formatDate(item.withdrawalEndsAt)}</span>}</span><StatusBadge descriptor={mastitisStatusDescriptor[item.status]} /></Link>)}</ScrollArea>;
  return <div className="page"><PageHeader icon={Activity} title="Mastite" subtitle="Fatos observados, decisões humanas, ações e carência informada" action={<Link className="button button-primary" to="/mastite/nova"><Plus size={18} aria-hidden />Registrar mastite</Link>} />
    {loading ? <SkeletonList rows={4} /> : error ? <ErrorState message={error} retry={reload} /> : <div className="grid gap-5"><SectionCard title={`Casos atuais (${open.length})`}>{open.length ? list(open) : <EmptyState title="Nenhum caso aberto" description="Casos em observação, tratamento ou carência aparecerão aqui." />}</SectionCard>{previous.length > 0 && <SectionCard title="Histórico">{list(previous)}</SectionCard>}</div>}
  </div>;
}

export function NewMastitisCasePage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  return <div className="page"><div className="page-narrow"><PageHeader icon={Activity} title="Registrar mastite" subtitle="O sistema registra fatos e o tratamento decidido; não faz diagnóstico" /><MastitisCaseForm initialAnimalId={search.get('animalId') ?? undefined} onSaved={(item) => navigate(`/mastite/${item.id}`, { replace: true })} /></div></div>;
}

export function MastitisCaseDetailPage() {
  const { id = '' } = useParams();
  const { data, loading, error, reload } = useResource<MastitisCaseDetail>(`/api/mastitis-cases/${id}`);
  const [editing, setEditing] = useState(false);
  if (loading) return <div className="page"><SkeletonList rows={4} /></div>;
  if (error || !data) return <div className="page"><ErrorState message={error || 'Caso não encontrado.'} retry={reload} /></div>;
  if (editing) return <div className="page"><div className="page-narrow"><PageHeader icon={Activity} title="Editar caso de mastite" action={<Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>} /><MastitisCaseForm initial={data} onSaved={async () => { await reload(); setEditing(false); }} /></div></div>;
  return <div className="page"><PageHeader icon={Activity} title={`Mastite — ${mastitisAnimalName(data)}`} subtitle={`Detectado em ${formatDate(dateFromTimestamp(data.detectedAt))}`} action={<Button onClick={() => setEditing(true)}>Editar caso</Button>} />
    <div className="grid gap-5"><SectionCard><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-[var(--muted)]">Animal</p><Link className="text-xl font-bold text-[var(--primary)]" to={`/rebanho/${data.animalId}`}>{mastitisAnimalName(data)}</Link>{data.observedSigns && <p className="mt-3">{data.observedSigns}</p>}{data.affectedQuarter && <p className="mt-2 text-sm">Teto: {mastitisQuarterLabel[data.affectedQuarter]}</p>}{data.treatmentSummary && <p className="mt-2 text-sm"><strong>Tratamento registrado:</strong> {data.treatmentSummary}</p>}</div><div className="flex flex-wrap gap-2"><StatusBadge descriptor={mastitisStatusDescriptor[data.status]} />{data.milkDiscardRequired &&<Badge tone="danger">Descarte informado</Badge>}</div></div></SectionCard>
      <WithdrawalNotice withdrawalEndsAt={data.withdrawalEndsAt} withdrawal={data.withdrawal} />
      <MastitisActions item={data} reload={reload} />
      {(data.notes || data.outcome) && <SectionCard title="Resultado e observações">{data.outcome && <p><strong>Resultado:</strong> {mastitisOutcomeLabel[data.outcome]}</p>}{data.notes && <p className="mt-2 text-sm">{data.notes}</p>}</SectionCard>}
    </div>
  </div>;
}

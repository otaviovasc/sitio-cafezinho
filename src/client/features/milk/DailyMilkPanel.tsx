import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDate, formatLiters } from '../../../domain/format';
import { useToast } from '../../components/feedback-context';
import { ConfirmButton, Modal } from '../../components/feedback';
import { Badge, Button, ErrorState, InlineEmpty, SectionCard, SkeletonList } from '../../components/ui';
import { useResource } from '../../hooks/useResource';
import { api } from '../../lib/api';
import { DailyMilkTotalForm, type DailyMilkTotal } from './DailyMilkTotalForm';

/**
 * Painel do total diário: somente exibição e gestão do histórico. A criação
 * mora na rota dedicada (`/producao/total/novo`); a edição abre em modal
 * reutilizando o mesmo formulário (kit). Sem formulário fixo concorrente.
 */
export function DailyMilkPanel({ onChange }: { onChange?: () => void } = {}) {
  const toast = useToast();
  const { data, loading, error, reload } = useResource<DailyMilkTotal[]>('/api/daily-milk-totals');
  const [editing, setEditing] = useState<DailyMilkTotal | null>(null);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  async function remove(id: string) {
    setBusy(true); setActionError('');
    try { await api(`/api/daily-milk-totals/${id}`, { method: 'DELETE' }); reload(); onChange?.(); toast('Produção excluída'); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível excluir o total diário.'); }
    finally { setBusy(false); }
  }

  return <SectionCard title="Produção total do dia" action={<Link className="button button-primary" to="/producao/total/novo"><Plus size={18} aria-hidden />Registrar total</Link>}>
    <p className="mb-4 text-sm text-[var(--muted)]">Volume agregado do rebanho todo ou de um lote medido separadamente. O sistema não distribui esse total entre as vacas e mantém o controle individual como outro fato.</p>
    {(error || actionError) && <div className="mb-3"><ErrorState message={actionError || error || ''} retry={error ? reload : undefined} /></div>}
    {loading ? <SkeletonList rows={3} /> : !data?.length ? <InlineEmpty>Nenhuma produção diária registrada.</InlineEmpty> : <div className="scroll-area max-h-96" tabIndex={0} role="region" aria-label="Histórico de produções diárias">{data.map((row) => <div className="border-b border-[var(--border)] py-3 last:border-b-0 sm:flex sm:items-center sm:justify-between sm:gap-3" key={row.id}>
      <div><div className="flex flex-wrap items-center gap-2"><strong>{formatDate(row.productionDate)}</strong><Badge>{row.herdGroupName ? `Lote: ${row.herdGroupName}` : 'Rebanho todo'}</Badge></div>{row.morningLiters !== null && row.afternoonLiters !== null ? <span className="block text-sm text-[var(--muted)]">Manhã {formatLiters(row.morningLiters)} · Tarde {formatLiters(row.afternoonLiters)}</span> : row.morningLiters !== null ? <span className="block text-sm text-[var(--muted)]">Manhã {formatLiters(row.morningLiters)} · lote sem ordenha à tarde</span> : row.afternoonLiters !== null ? <span className="block text-sm text-[var(--muted)]">Tarde {formatLiters(row.afternoonLiters)}</span> : <span className="block text-sm text-[var(--muted)]">Registro histórico sem divisão por período</span>}{row.notes && <span className="block text-sm text-[var(--muted)]">{row.notes}</span>}</div>
      <div className="mt-3 sm:mt-0 sm:text-right"><strong className="block text-lg">{formatLiters(row.totalLiters)}</strong><div className="mt-2 grid grid-cols-2 gap-2 sm:flex"><Button variant="secondary" onClick={() => { setEditing(row); setActionError(''); }}>Editar</Button><ConfirmButton variant="danger" disabled={busy} question="Excluir esta produção diária?" onClick={() => void remove(row.id)}>Excluir</ConfirmButton></div></div>
    </div>)}</div>}
    <Modal open={Boolean(editing)} title="Editar produção diária" description="Corrige a data, o escopo ou os valores medidos." onClose={() => setEditing(null)}>
      {editing && <DailyMilkTotalForm initial={editing} onSaved={() => { setEditing(null); reload(); onChange?.(); toast('Produção atualizada'); }} />}
    </Modal>
  </SectionCard>;
}

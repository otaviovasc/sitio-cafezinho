import { Link } from 'react-router-dom';
import { Banknote } from 'lucide-react';
import { formatDate, formatMoney } from '../../../../domain/format';
import { formatWeight } from '../../../../domain/weight';
import { SectionCard } from '../../../components/ui';
import { AttachmentPanel } from '../../../components/AttachmentPanel';
import type { AnimalDetail } from '../../../pages/AnimalsPage';

export function AnimalExitsSection({ data, onChange }: { data: AnimalDetail; onChange: () => void }) {
  return <SectionCard title="Saídas e receitas" icon={Banknote} className="lg:col-span-2">{data.exits.map((exit) => <div className="border-b border-[var(--border)] py-4 last:border-b-0" key={exit.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><strong>{exit.status === 'DEAD' ? 'Morte registrada' : 'Saída econômica registrada'}</strong><span className="block text-xs text-[var(--muted)]">{formatDate(exit.changedOn)}{exit.reason ? ` · ${exit.reason}` : ''}</span>{exit.buyerName && <span className="block text-sm">Comprador: {exit.buyerName}</span>}{exit.weightKg && <span className="block text-sm">Peso: {formatWeight(exit.weightKg)}</span>}</div>{exit.amount && <strong>{formatMoney(exit.amount)}</strong>}</div><div className="mt-3"><AttachmentPanel attachments={exit.attachments} animalExitId={exit.id} onChange={onChange} /></div></div>)}{data.revenues.length > 0 && <div className="mt-4"><h3 className="text-sm font-bold">Receitas vinculadas</h3>{data.revenues.map((revenue) => <Link className="mobile-item" key={revenue.id} to={`/receitas/${revenue.id}`}><span><strong>{revenue.description}</strong><span className="block text-xs text-[var(--muted)]">{formatDate(revenue.revenueDate)}</span></span><strong>{formatMoney(revenue.amount)}</strong></Link>)}</div>}</SectionCard>;
}

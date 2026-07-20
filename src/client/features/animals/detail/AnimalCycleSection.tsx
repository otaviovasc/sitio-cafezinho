import { HeartPulse, Pencil } from 'lucide-react';
import { allowedNextStatuses, statusTone } from '../../../../domain/animal-lifecycle';
import { formatDate } from '../../../../domain/format';
import { Badge, Button, ScrollArea, SectionCard, StatCard, StatusBadge } from '../../../components/ui';
import { ConfirmButton } from '../../../components/feedback';
import { animalStatusDescriptor } from '../../../lib/status';
import { animalStatusLabels } from '../../../lib/labels';
import type { AnimalDetail } from '../../../pages/AnimalsPage';
import type { ReproductiveEvent } from '../ReproductiveEventForm';

type AnimalCycleSectionProps = {
  data: AnimalDetail;
  resolveAnimalName?: (animalId: string) => string | undefined;
  onChangeStatus: () => void;
  onRegisterReproductiveEvent: () => void;
  onEditReproductiveEvent: (event: ReproductiveEvent) => void;
  onUndoStatus: (eventId: string) => void;
  onRemoveReproductiveEvent: (eventId: string) => void;
};

export function AnimalCycleSection({ data, resolveAnimalName, onChangeStatus, onRegisterReproductiveEvent, onEditReproductiveEvent, onUndoStatus, onRemoveReproductiveEvent }: AnimalCycleSectionProps) {
  const bullLabel = (event: ReproductiveEvent) => event.bullName ?? (event.bullId ? resolveAnimalName?.(event.bullId) ?? 'Touro do rebanho' : null);
  const latestStatus = data.statusHistory[0];
  const timeline = [
    ...data.statusHistory.map((event) => ({ kind: 'STATUS' as const, date: event.changedOn, event })),
    ...data.reproductiveEvents.filter((event) => event.type === 'HEAT').map((event) => ({ kind: 'HEAT' as const, date: event.occurredOn, event })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return <SectionCard title="Ciclo produtivo e reprodução" icon={HeartPulse} className="lg:col-span-2">
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-[var(--surface-strong)] p-4">
          <p><span className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Situação produtiva</span><span className="mt-1 block"><StatusBadge descriptor={animalStatusDescriptor(data.status)} /></span><span className="mt-2 block text-sm text-[var(--muted)]">{data.status === 'HEIFER' ? 'Antes da primeira lactação; não entra nos lotes de ordenha.' : data.status === 'LACTATING' ? 'Produz leite e deve estar em um lote de ordenha.' : data.status === 'DRY' ? 'Entre lactações; não deve receber medição de leite.' : data.status === 'CALF' ? 'Cria jovem; fica sem lote ou em lote sem ordenha.' : data.status === 'GROWING' ? 'Em recria/engorda; fica sem lote ou em lote sem ordenha.' : data.status === 'BULL' ? 'Touro do rebanho; disponível como pai nas coberturas e crias.' : 'Fora do rebanho atual.'}</span></p>
          {allowedNextStatuses(data.status).length > 0 && <Button onClick={onChangeStatus}>{data.status === 'LACTATING' ? 'Iniciar período seco' : data.status === 'DRY' || data.status === 'HEIFER' ? 'Registrar parto' : 'Alterar situação'}</Button>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" onClick={onRegisterReproductiveEvent}><HeartPulse size={17} aria-hidden />Registrar cio</Button>{latestStatus?.previousStatus && <ConfirmButton variant="secondary" question={`Desfazer a mudança mais recente para ${animalStatusLabels[latestStatus.status]}?`} onClick={() => onUndoStatus(latestStatus.id)}>Desfazer última situação</ConfirmButton>}</div>
      </div>
      <div className="grid grid-cols-2 gap-3 self-start">
        <StatCard label="Último parto" value={data.reproductiveSummary.lastCalvingOn ? formatDate(data.reproductiveSummary.lastCalvingOn) : '—'} detail="Parto registrado ao iniciar lactação" />
        <StatCard label="Último cio" value={data.reproductiveSummary.lastHeatOn ? formatDate(data.reproductiveSummary.lastHeatOn) : '—'} />
        <StatCard label="Coberturas no ciclo" value={data.reproductiveSummary.attemptsInCurrentCycle} detail={data.reproductiveSummary.pendingAttempts ? `${data.reproductiveSummary.pendingAttempts} aguardando resultado` : 'Nenhuma pendente'} />
        <StatCard label="Prenhez no ciclo" value={data.reproductiveSummary.lastPregnancyOn ? 'Confirmada' : 'Não confirmada'} detail={data.reproductiveSummary.attemptsUntilLastPregnancy ? `${data.reproductiveSummary.attemptsUntilLastPregnancy} tentativa(s)` : 'Sem inferência automática'} />
      </div>
    </div>
    <h3 className="mt-6 text-sm font-bold">Linha do tempo</h3>
    <ScrollArea label="Linha do tempo produtiva e reprodutiva" className="mt-2 max-h-96">{timeline.map((item) => item.kind === 'STATUS' ? <div className="mobile-item items-start" key={`status-${item.event.id}`}><span><strong>{item.event.status === 'LACTATING' && item.event.previousStatus ? 'Parto e início da lactação' : animalStatusLabels[item.event.status]}</strong><span className="block text-xs text-[var(--muted)]">{formatDate(item.event.changedOn)}{item.event.previousStatus ? ` · antes: ${animalStatusLabels[item.event.previousStatus]}` : ' · situação inicial'}</span>{item.event.notes && <span className="block text-xs text-[var(--muted)]">{item.event.notes}</span>}</span><Badge tone={statusTone(item.event.status)}>Ciclo</Badge></div> : <div className="mobile-item items-start" key={`heat-${item.event.id}`}><span><strong>{item.event.hadBreeding ? 'Cio com cobertura' : 'Cio observado'}</strong><span className="block text-xs text-[var(--muted)]">{formatDate(item.event.occurredOn)}{bullLabel(item.event) ? ` · touro: ${bullLabel(item.event)}` : ''}</span>{item.event.hadBreeding && <span className="block text-xs text-[var(--muted)]">{item.event.outcome === 'PREGNANT' ? 'Prenhez confirmada' : item.event.outcome === 'NOT_PREGNANT' ? 'Não emprenhou' : 'Aguardando confirmação'}{item.event.outcomeRecordedOn ? ` em ${formatDate(item.event.outcomeRecordedOn)}` : ''}</span>}{item.event.notes && <span className="block text-xs text-[var(--muted)]">{item.event.notes}</span>}</span><span className="flex shrink-0 gap-1"><Button variant="secondary" aria-label="Editar cio" onClick={() => onEditReproductiveEvent(item.event)}><Pencil size={15} aria-hidden /></Button><ConfirmButton variant="danger" aria-label="Excluir cio" question="Excluir este registro de cio?" onClick={() => onRemoveReproductiveEvent(item.event.id)}>Excluir</ConfirmButton></span></div>)}</ScrollArea>
  </SectionCard>;
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wheat } from 'lucide-react';
import { feedingContextLabels, type FeedingContext } from '../../domain/feeding';
import { FeedingEventForm } from '../features/feeding/FeedingEventForm';
import { useToast } from '../components/feedback-context';
import { Field, PageHeader, SectionCard, Select } from '../components/ui';

/**
 * Trato do dia fora do jogo (tarefa do "Hoje" e tipo de entrada "Trato").
 * Mesmo formulário das folhas do jogo; o contexto (ordenha/pasto/estação) é
 * escolhido aqui.
 */
export function NewFeedingEventPage() {
  const [context, setContext] = useState<FeedingContext>('MILKING');
  const toast = useToast();
  const navigate = useNavigate();
  return <div className="page">
    <PageHeader icon={Wheat} title="Registrar trato" subtitle="Alimentação dada ao rebanho: entra no estoque por compra, sai por aqui" />
    <div className="page-narrow grid gap-5">
      <SectionCard>
        <Field label="Onde o trato foi dado" hint="Ordenha exige o lote; pasto e estação podem valer para o rebanho todo.">
          <Select value={context} onChange={(event) => setContext(event.target.value as FeedingContext)}>
            {Object.entries(feedingContextLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </Field>
        <div className="mt-4">
          <FeedingEventForm key={context} context={context} onSaved={() => { toast('Trato registrado'); navigate('/'); }} />
        </div>
      </SectionCard>
    </div>
  </div>;
}

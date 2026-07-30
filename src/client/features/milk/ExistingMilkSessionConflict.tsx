import { formatDate } from '../../../domain/format';
import { Button } from '../../components/ui';

export type MilkSessionReference = {
  id: string;
  sessionDate: string;
  herdGroupId?: string | null;
};

export function ExistingMilkSessionConflict({
  session,
  onOpen,
  onCancel,
}: {
  session: MilkSessionReference;
  onOpen: () => void;
  onCancel: () => void;
}) {
  return <div className="notice notice-warning" role="alert">
    <strong className="block">Já existe um controle em {formatDate(session.sessionDate)}.</strong>
    <p className="mt-1 text-sm">Abra o controle existente para consultar ou corrigir as medições.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <Button onClick={onOpen}>Abrir controle</Button>
      <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
    </div>
  </div>;
}

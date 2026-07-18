import { useState } from 'react';
import { FileText } from 'lucide-react';
import { AttachmentPanel, type Attachment } from '../components/AttachmentPanel';
import { ErrorState, LoadingState, PageHeader, SectionCard } from '../components/ui';
import { FilterControls } from '../components/FilterControls';
import { useResource } from '../hooks/useResource';
import { documentLabels } from '../lib/labels';

export function DocumentsPage() {
  const { data, loading, error, reload } = useResource<Attachment[]>('/api/attachments');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('ALL');
  const filtered = (data ?? []).filter((attachment) => (type === 'ALL' || attachment.documentType === type)
    && `${attachment.originalFilename} ${attachment.notes ?? ''}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  return <div className="page"><PageHeader icon={FileText} title="Documentos" subtitle="Arquivos avulsos e vinculados" />
    {loading ? <LoadingState /> : error ? <ErrorState message={error} retry={reload} /> : <SectionCard title="Enviar ou consultar"><p className="mb-4 text-sm text-[var(--muted)]">Envios feitos aqui ficam avulsos. Para ligar nota, boleto ou comprovante a uma compra, envie no detalhe da compra.</p><FilterControls search={{ label: 'Buscar documento', value: search, onChange: setSearch, placeholder: 'Nome ou observação' }} selects={[{ label: 'Tipo', value: type, onChange: setType, options: [{ value: 'ALL', label: 'Todos' }, ...Object.entries(documentLabels).map(([value, label]) => ({ value, label }))] }]} /><div className="mt-4"><AttachmentPanel attachments={filtered} onChange={reload} /></div></SectionCard>}
  </div>;
}

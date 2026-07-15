import { useState } from 'react';
import { FileText } from 'lucide-react';
import { AttachmentPanel, type Attachment } from '../components/AttachmentPanel';
import { ErrorState, Field, FilterBar, Input, LoadingState, PageHeader, SectionCard, Select } from '../components/ui';
import { useResource } from '../hooks/useResource';
import { documentLabels } from '../lib/labels';

export function DocumentsPage() {
  const { data, loading, error, reload } = useResource<Attachment[]>('/api/attachments');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('ALL');
  const filtered = (data ?? []).filter((attachment) => (type === 'ALL' || attachment.documentType === type)
    && `${attachment.originalFilename} ${attachment.notes ?? ''}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  return <div className="page"><PageHeader icon={FileText} title="Documentos" subtitle="Arquivos avulsos e vinculados" />
    {loading ? <LoadingState /> : error ? <ErrorState message={error} retry={reload} /> : <SectionCard title="Enviar ou consultar"><p className="mb-4 text-sm text-[var(--muted)]">Envios feitos aqui ficam avulsos. Para ligar nota, boleto ou comprovante a uma compra, envie no detalhe da compra.</p><FilterBar><Field label="Buscar documento"><Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome ou observação" /></Field><Field label="Tipo"><Select value={type} onChange={(event) => setType(event.target.value)}><option value="ALL">Todos</option>{Object.entries(documentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field></FilterBar><div className="mt-4"><AttachmentPanel attachments={filtered} onChange={reload} /></div></SectionCard>}
  </div>;
}

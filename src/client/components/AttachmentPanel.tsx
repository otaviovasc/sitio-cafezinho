import { useId, useRef, useState } from 'react';
import { api } from '../lib/api';
import { documentLabels } from '../lib/labels';
import { Badge, Button, ConfirmButton, ErrorState, Field, Input, ScrollArea, Select } from './ui';

export type Attachment = {
  id: string; originalFilename: string; mimeType: string; sizeBytes: number; documentType: string;
  storageStatus: string; notes: string | null;
};

export function AttachmentPanel({ attachments, purchaseId, milkSessionId, milkCollectionId, revenueId, animalExitId, onChange }: {
  attachments: Attachment[]; purchaseId?: string; milkSessionId?: string; milkCollectionId?: string; revenueId?: string; animalExitId?: string; onChange: () => void;
}) {
  const [documentType, setDocumentType] = useState('OTHER');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedFilename, setSelectedFilename] = useState('');
  const [editing, setEditing] = useState<Attachment | null>(null);
  const [editingType, setEditingType] = useState('OTHER');
  const [editingNotes, setEditingNotes] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();
  const fileHintId = `${fileInputId}-hint`;

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError('Selecione ou fotografe um documento.'); return; }
    const form = new FormData();
    form.set('file', file);
    form.set('documentType', documentType);
    if (purchaseId) form.set('purchaseId', purchaseId);
    if (milkSessionId) form.set('milkSessionId', milkSessionId);
    if (milkCollectionId) form.set('milkCollectionId', milkCollectionId);
    if (revenueId) form.set('revenueId', revenueId);
    if (animalExitId) form.set('animalExitId', animalExitId);
    setBusy(true); setError('');
    try {
      await api('/api/attachments', { method: 'POST', body: form });
      if (fileRef.current) fileRef.current.value = '';
      setSelectedFilename('');
      onChange();
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha no envio.'); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    setBusy(true); setError('');
    try { await api(`/api/attachments/${id}`, { method: 'DELETE' }); onChange(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao excluir.'); }
    finally { setBusy(false); }
  }

  function startEditing(item: Attachment) {
    setEditing(item); setEditingType(item.documentType); setEditingNotes(item.notes ?? '');
  }

  async function saveMetadata() {
    if (!editing) return;
    setBusy(true); setError('');
    try {
      await api(`/api/attachments/${editing.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ documentType: editingType, notes: editingNotes.trim() || null }) });
      setEditing(null); onChange();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao editar o documento.'); }
    finally { setBusy(false); }
  }

  return <div className="grid gap-4">
    {error && <ErrorState message={error} />}
    <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
      <div className="field min-w-0">
        <label className="field-label" htmlFor={fileInputId}>Arquivo</label>
        <input
          ref={fileRef}
          id={fileInputId}
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          capture="environment"
          aria-describedby={fileHintId}
          onChange={(event) => setSelectedFilename(event.target.files?.[0]?.name ?? '')}
        />
        <div className="flex min-w-0 items-center gap-2">
          <label className="button button-secondary shrink-0 cursor-pointer" htmlFor={fileInputId}>Escolher</label>
          <span className="min-w-0 truncate text-sm text-[var(--muted)]">{selectedFilename || 'Nenhum arquivo'}</span>
        </div>
        <span className="field-hint" id={fileHintId}>JPEG, PNG, WebP ou PDF, até 15 MB</span>
      </div>
      <Field label="Tipo">
        <Select value={documentType} onChange={(event) => setDocumentType(event.target.value)}>{Object.entries(documentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
      </Field>
      <Button className="w-full sm:w-auto" disabled={busy} onClick={upload}>{busy ? 'Enviando…' : 'Enviar'}</Button>
    </div>
    {!attachments.length ? <p className="text-sm text-[var(--muted)]">Nenhum documento enviado.</p> : <ScrollArea label="Documentos enviados">{attachments.map((item) => <div className="border-b border-[var(--border)] py-3 last:border-b-0" key={item.id}>
      <div className="sm:flex sm:items-center sm:justify-between sm:gap-3"><div className="min-w-0"><p className="break-all font-semibold sm:truncate">{item.originalFilename}</p><div className="mt-1 flex flex-wrap items-center gap-2"><Badge>{documentLabels[item.documentType] || item.documentType}</Badge><span className="text-xs text-[var(--muted)]">{(Number(item.sizeBytes) / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB</span>{item.notes && <span className="text-xs text-[var(--muted)]">· {item.notes}</span>}</div></div>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-0 sm:flex sm:shrink-0"><a className="button button-secondary" href={`/api/attachments/${item.id}/file`} target="_blank" rel="noreferrer">Abrir</a><Button variant="secondary" onClick={() => startEditing(item)}>Editar</Button><ConfirmButton variant="danger" question="Excluir este documento? O arquivo também será removido do armazenamento." disabled={busy} onClick={() => void remove(item.id)}>Excluir</ConfirmButton></div></div>
      {editing?.id === item.id && <div className="mt-3 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 sm:grid-cols-2"><Field label="Tipo do documento"><Select value={editingType} onChange={(event) => setEditingType(event.target.value)}>{Object.entries(documentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field><Field label="Observação"><Input value={editingNotes} onChange={(event) => setEditingNotes(event.target.value)} /></Field><div className="flex gap-2 sm:col-span-2"><Button disabled={busy} onClick={() => void saveMetadata()}>Salvar</Button><Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button></div></div>}
    </div>)}</ScrollArea>}
  </div>;
}

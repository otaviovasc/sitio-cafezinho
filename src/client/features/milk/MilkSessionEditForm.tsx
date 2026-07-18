import { useState } from 'react';
import { Button, Field, Input, SectionCard, Textarea } from '../../components/ui';

export function MilkSessionEditForm({ initialDate, initialTitle, initialNotes, busy, onSave, onCancel }: {
  initialDate: string;
  initialTitle: string;
  initialNotes: string;
  busy: boolean;
  onSave: (values: { sessionDate: string; title: string; notes: string }) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [sessionDate, setSessionDate] = useState(initialDate);
  const [sessionTitle, setSessionTitle] = useState(initialTitle);
  const [sessionNotes, setSessionNotes] = useState(initialNotes);
  return <SectionCard title="Editar controle"><div className="grid gap-3 sm:grid-cols-2"><Field label="Data do controle"><Input type="date" value={sessionDate} onChange={(event) => setSessionDate(event.target.value)} required /></Field><Field label="Título"><Input value={sessionTitle} onChange={(event) => setSessionTitle(event.target.value)} /></Field><Field label="Observação"><Textarea className="min-h-12" value={sessionNotes} onChange={(event) => setSessionNotes(event.target.value)} /></Field></div><p className="mt-2 text-xs text-[var(--muted)]">Corrigir a data mantém todas as medições e rótulos deste controle.</p><div className="mt-3 flex gap-2"><Button disabled={busy || !sessionDate} onClick={() => void onSave({ sessionDate, title: sessionTitle, notes: sessionNotes })}>{busy ? 'Salvando…' : 'Salvar'}</Button><Button variant="secondary" onClick={onCancel}>Cancelar</Button></div></SectionCard>;
}

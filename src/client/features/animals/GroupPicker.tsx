import { useEffect, useState } from 'react';
import { Pencil, Plus, X } from 'lucide-react';
import { Button, ErrorState, Field, Input, Select } from '../../components/ui';
import { useResource } from '../../hooks/useResource';
import { api, json } from '../../lib/api';
import { milkingRoutineLabels } from '../../lib/labels';
import type { MilkingRoutine } from '../../../domain/herd';

export type HerdGroup = {
  id: string;
  name: string;
  milkingRoutine: MilkingRoutine;
  active: boolean;
  animalCount: number;
};

type Props = {
  value: string;
  onChange: (groupId: string) => void;
  label?: string;
  required?: boolean;
};

export function GroupPicker({ value, onChange, label = 'Lote de ordenha', required = true }: Props) {
  const { data: groups = [], loading, error, reload } = useResource<HerdGroup[]>('/api/herd-groups');
  const selected = groups?.find((group) => group.id === value) ?? null;
  const [mode, setMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [name, setName] = useState('');
  const [routine, setRoutine] = useState<HerdGroup['milkingRoutine']>('MORNING_AND_AFTERNOON');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!value && groups?.length) onChange(groups.find((group) => group.active)?.id ?? '');
  }, [groups, onChange, value]);

  function openCreate() {
    setMode('create'); setName(''); setRoutine('MORNING_AND_AFTERNOON'); setActionError('');
  }

  function openEdit() {
    if (!selected) return;
    setMode('edit'); setName(selected.name); setRoutine(selected.milkingRoutine); setActionError('');
  }

  async function save() {
    setBusy(true); setActionError('');
    try {
      const saved = await api<HerdGroup>(mode === 'edit' && selected ? `/api/herd-groups/${selected.id}` : '/api/herd-groups', json(mode === 'edit' ? 'PATCH' : 'POST', { name, milkingRoutine: routine, active: true }));
      onChange(saved.id); setMode('closed'); await reload();
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Não foi possível salvar o grupo.'); }
    finally { setBusy(false); }
  }

  return <div className="grid min-w-0 gap-2">
    <Field label={label} hint={selected ? milkingRoutineLabels[selected.milkingRoutine] : undefined}>
      <Select value={value} onChange={(event) => { onChange(event.target.value); setMode('closed'); }} required={required} disabled={loading}>
        <option value="">Selecione</option>
        {groups?.filter((group) => group.active).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
      </Select>
    </Field>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="secondary" onClick={openCreate}><Plus size={17} aria-hidden />Criar lote</Button>
      {selected && <Button type="button" variant="secondary" onClick={openEdit}><Pencil size={17} aria-hidden />Editar regra</Button>}
    </div>
    {error && <ErrorState message={error} retry={reload} />}
    {mode !== 'closed' && <div className="notice notice-info grid gap-3">
      <div className="flex items-center justify-between gap-3"><strong>{mode === 'create' ? 'Novo lote' : `Editar ${selected?.name}`}</strong><Button type="button" variant="secondary" aria-label="Fechar edição do lote" onClick={() => setMode('closed')}><X size={17} aria-hidden /></Button></div>
      {actionError && <div className="notice notice-error">{actionError}</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome do lote"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Lote 2" required /></Field>
        <Field label="Rotina de ordenha"><Select value={routine} onChange={(event) => setRoutine(event.target.value as HerdGroup['milkingRoutine'])}>{Object.entries(milkingRoutineLabels).filter(([key]) => key !== 'NOT_MILKED').map(([key, text]) => <option key={key} value={key}>{text}</option>)}</Select></Field>
      </div>
      <Button type="button" disabled={busy || !name.trim()} onClick={() => void save()}>{busy ? 'Salvando…' : mode === 'create' ? 'Criar e selecionar' : 'Salvar regra'}</Button>
    </div>}
  </div>;
}

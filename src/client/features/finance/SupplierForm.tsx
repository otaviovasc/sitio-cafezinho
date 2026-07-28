import { ErrorState, Field, FormErrorSummary, Input, SubmitBar, Textarea } from '../../components/ui';
import { useForm } from '../../hooks/useForm';
import { useSubmit } from '../../hooks/useSubmit';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { api, json } from '../../lib/api';

/**
 * Cadastro rápido de fornecedor (POST /api/suppliers), extraído da
 * SuppliersPage para ser montado também na folha da Casa no jogo.
 */
export function SupplierForm({ onSaved }: { onSaved?: () => void | Promise<void> }) {
  const { busy, error, run } = useSubmit();
  const form = useForm({ name: '', notes: '' });
  useUnsavedGuard(form.dirty);

  async function persist() {
    await api('/api/suppliers', json('POST', { name: form.values.name, notes: form.values.notes || null }));
    form.reset({ name: '', notes: '' });
    await onSaved?.();
  }

  return <form className="grid gap-3" noValidate onSubmit={(event) => { event.preventDefault(); if (form.validate()) void run(persist); }}>
    {error && <ErrorState message={error} />}
    <FormErrorSummary errors={form.visibleErrors} />
    <Field label="Nome"><Input value={form.values.name} onChange={(event) => form.set('name', event.target.value)} required autoFocus /></Field>
    <Field label="Observação"><Textarea value={form.values.notes} onChange={(event) => form.set('notes', event.target.value)} /></Field>
    <SubmitBar label="Cadastrar" busy={busy} />
  </form>;
}

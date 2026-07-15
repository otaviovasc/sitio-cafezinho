import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, json } from '../lib/api';
import { Button, ErrorState, Field, Input } from '../components/ui';
import { CowHead } from '../components/icons';

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api('/api/session/login', json('POST', { password })); onLogin(); navigate('/', { replace: true }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível entrar.'); }
    finally { setBusy(false); }
  }

  return <main className="flex min-h-screen items-center justify-center px-4 py-10">
    <div className="w-full max-w-sm">
      <div className="mb-6 text-center"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary)] text-white"><CowHead size={32} strokeWidth={2.1} aria-hidden /></div><h1 className="text-2xl font-bold">Sítio Cafezinho</h1><p className="mt-1 text-sm text-[var(--muted)]">Gestão simples da propriedade</p></div>
      <form className="section-card grid gap-4" onSubmit={submit}>
        <div><h2 className="text-xl font-bold">Entrar</h2><p className="mt-1 text-sm text-[var(--muted)]">Use a senha compartilhada da família.</p></div>
        {error && <ErrorState message={error} />}
        <Field label="Senha">
          <Input autoFocus autoComplete="current-password" type={show ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} required />
        </Field>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input className="h-5 w-5 accent-[var(--primary)]" type="checkbox" checked={show} onChange={(event) => setShow(event.target.checked)} />Mostrar senha</label>
        <Button type="submit" disabled={busy || !password}>{busy ? 'Entrando…' : 'Entrar'}</Button>
      </form>
    </div>
  </main>;
}

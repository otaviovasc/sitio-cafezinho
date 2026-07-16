import type { ComponentType, ReactNode } from 'react';
import { Files, Home, LogOut, Milk, Scale, WalletCards, type LucideProps } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { CowHead } from './icons';
import { api, json } from '../lib/api';

const nav: Array<{ to: string; label: string; icon: ComponentType<LucideProps> }> = [
  { to: '/', label: 'Hoje', icon: Home },
  { to: '/producao', label: 'Produção', icon: Milk },
  { to: '/rebanho', label: 'Rebanho', icon: CowHead },
  { to: '/pesos', label: 'Peso', icon: Scale },
  { to: '/financeiro', label: 'Financeiro', icon: WalletCards },
  { to: '/documentos', label: 'Documentos', icon: Files },
];

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  async function logout() {
    await api('/api/session/logout', json('POST'));
    navigate('/entrar', { replace: true });
  }
  return <div className="min-h-screen">
    <header className="relative z-20 flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 lg:hidden">
      <NavLink to="/" className="flex items-center gap-2 font-bold text-[var(--primary)]"><CowHead size={22} aria-hidden />Sítio Cafezinho</NavLink>
      <button className="button button-secondary" onClick={logout}><LogOut size={17} aria-hidden />Sair</button>
    </header>
    <header className="sticky top-0 z-20 hidden border-b border-[var(--border)] bg-[var(--surface)] lg:block">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <NavLink to="/" className="flex items-center gap-2 font-bold text-[var(--primary)]"><CowHead size={22} aria-hidden />Sítio Cafezinho</NavLink>
        <nav className="flex items-center gap-1">{nav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : 'text-[var(--muted)]'}`}><Icon size={17} aria-hidden />{label}</NavLink>)}</nav>
        <button className="button button-secondary" onClick={logout}><LogOut size={17} aria-hidden />Sair</button>
      </div>
    </header>
    <main>{children}</main>
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-[var(--border)] bg-[var(--surface)] px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 lg:hidden">
      {nav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg px-0.5 text-center text-[9px] font-bold ${isActive ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : 'text-[var(--muted)]'}`}><Icon className="shrink-0" size={20} aria-hidden /><span className="block max-w-full truncate">{label}</span></NavLink>)}
    </nav>
  </div>;
}

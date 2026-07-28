import { useEffect, type ComponentType, type ReactNode } from 'react';
import { BookOpen, ChartLine, LogOut, Map as MapIcon, type LucideProps } from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { CowHead } from './icons';
import { MicFab } from './capture';
import { api, json } from '../lib/api';

// Menu mínimo da fase 6: o jogo é a home. Registro e consulta do dia a dia
// acontecem no tabuleiro (folhas e Caderno); fora dele só ficam os gráficos e
// as listas de auditoria (hub /graficos). O assistente não vira item de menu —
// o MicFab global já abre a CaptureSheet em qualquer tela. "Caderno" não tem
// rota própria: abre o caderno do jogo via parâmetro `?caderno=1`.
const nav: Array<{ to: string; label: string; icon: ComponentType<LucideProps>; notebook?: boolean }> = [
  { to: '/', label: 'Mapa', icon: MapIcon },
  { to: '/?caderno=1', label: 'Caderno', icon: BookOpen, notebook: true },
  { to: '/graficos', label: 'Gráficos', icon: ChartLine },
];

function navClass(active: boolean) {
  return `flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${active ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : 'text-[var(--muted)]'}`;
}

function navClassMobile(active: boolean) {
  return `flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg px-0.5 text-center text-[9px] font-bold ${active ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : 'text-[var(--muted)]'}`;
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const notebookActive = location.pathname === '/' && new URLSearchParams(location.search).has('caderno');
  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const isEditing = target?.matches('input, textarea, select, [contenteditable="true"]');
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !isEditing) {
        const search = [...document.querySelectorAll<HTMLInputElement>('input[type="search"]:not(:disabled)')].find((input) => input.offsetParent !== null);
        if (search) {
          event.preventDefault();
          search.focus();
          search.select();
        }
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        const form = target?.closest('form');
        if (form instanceof HTMLFormElement) {
          event.preventDefault();
          form.requestSubmit();
        }
      }
    }
    document.addEventListener('keydown', handleKeyboardShortcut);
    return () => document.removeEventListener('keydown', handleKeyboardShortcut);
  }, []);
  async function logout() {
    await api('/api/session/logout', json('POST'));
    navigate('/entrar', { replace: true });
  }
  const isActive = (item: (typeof nav)[number], routeActive: boolean) => item.notebook ? notebookActive : routeActive && !notebookActive;
  return <div className="min-h-screen">
    <header className="relative z-20 flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 lg:hidden">
      <NavLink to="/" className="flex items-center gap-2 font-bold text-[var(--primary)]"><CowHead size={22} aria-hidden />Sítio Cafezinho</NavLink>
      <button className="button button-secondary" onClick={logout}><LogOut size={17} aria-hidden />Sair</button>
    </header>
    <header className="sticky top-0 z-20 hidden border-b border-[var(--border)] bg-[var(--surface)] lg:block">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <NavLink to="/" className="flex items-center gap-2 font-bold text-[var(--primary)]"><CowHead size={22} aria-hidden />Sítio Cafezinho</NavLink>
        <nav className="flex items-center gap-1">{nav.map((item) => <NavLink key={item.label} to={item.to} end={item.to === '/'} className={({ isActive: routeActive }) => navClass(isActive(item, routeActive))}><item.icon size={17} aria-hidden />{item.label}</NavLink>)}</nav>
        <button className="button button-secondary" onClick={logout}><LogOut size={17} aria-hidden />Sair</button>
      </div>
    </header>
    <main>{children}</main>
    <MicFab />
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-[var(--border)] bg-[var(--surface)] px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 lg:hidden">
      {nav.map((item) => <NavLink key={item.label} to={item.to} end={item.to === '/'} className={({ isActive: routeActive }) => navClassMobile(isActive(item, routeActive))}><item.icon className="shrink-0" size={20} aria-hidden /><span className="block max-w-full truncate">{item.label}</span></NavLink>)}
    </nav>
  </div>;
}

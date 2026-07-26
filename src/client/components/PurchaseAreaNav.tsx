import { Link, useLocation } from 'react-router-dom';

const entries = [
  { to: '/compras', label: 'Compras' },
  { to: '/estoque-alimentos', label: 'Estoque' },
  { to: '/catalogo-alimentos', label: 'Catálogo' },
  { to: '/fornecedores', label: 'Fornecedores' },
];

export function PurchaseAreaNav() {
  const { pathname } = useLocation();
  return <nav className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Compras e estoque">
    {entries.map((entry) => {
      const active = entry.to === '/compras'
        ? pathname === '/compras'
        : entry.to === '/estoque-alimentos'
          ? pathname.startsWith('/estoque-alimentos') || pathname.startsWith('/compras/alimentos/')
          : pathname.startsWith(entry.to);
      return <Link
        aria-current={active ? 'page' : undefined}
        className={`flex min-h-11 items-center justify-center rounded-xl border px-3 text-center text-sm font-bold ${active ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]'}`}
        key={entry.to}
        to={entry.to}
      >
        {entry.label}
      </Link>;
    })}
  </nav>;
}

import { cloneElement, isValidElement, useEffect, useId, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactElement, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Link, useLocation } from 'react-router-dom';

const topLevelRoutes = new Set(['/', '/rebanho', '/producao', '/pesos', '/financeiro', '/documentos']);

function backDestination(pathname: string): { to: string; label: string } | null {
  if (topLevelRoutes.has(pathname)) return null;
  if (pathname === '/mastite') return { to: '/', label: 'Hoje' };
  if (pathname.startsWith('/mastite/')) return { to: '/mastite', label: 'Mastite' };
  if (pathname === '/compras') return { to: '/financeiro', label: 'Financeiro' };
  if (pathname.startsWith('/compras/')) return { to: '/compras', label: 'Compras' };
  if (pathname === '/fornecedores') return { to: '/compras', label: 'Compras' };
  if (pathname.startsWith('/fornecedores/')) return { to: '/fornecedores', label: 'Fornecedores' };
  if (pathname.startsWith('/receitas/')) return { to: '/financeiro', label: 'Financeiro' };
  if (pathname.startsWith('/financeiro/')) return { to: '/financeiro', label: 'Financeiro' };
  if (pathname.startsWith('/rebanho/')) return { to: '/rebanho', label: 'Rebanho' };
  if (pathname.startsWith('/producao/')) return { to: '/producao', label: 'Produção' };
  if (pathname.startsWith('/pesos/')) return { to: '/pesos', label: 'Peso' };
  if (pathname === '/configuracoes/dados') return { to: '/', label: 'Hoje' };
  return { to: '/', label: 'Hoje' };
}

export function PageHeader({ title, subtitle, action, icon: Icon }: { title: string; subtitle?: string; action?: ReactNode; icon?: LucideIcon }) {
  const location = useLocation();
  const back = backDestination(location.pathname);
  return <header className="page-header"><div className="min-w-0">{back && <Link className="page-back" to={back.to}><ArrowLeft size={17} aria-hidden />Voltar para {back.label}</Link>}<h1 className="page-title">{Icon && <Icon className="title-icon" size={28} strokeWidth={2.2} aria-hidden />}{title}</h1>{subtitle && <p className="page-subtitle">{subtitle}</p>}</div>{action}</header>;
}

export function SectionCard({ title, action, children, className = '', icon: Icon }: { title?: string; action?: ReactNode; children: ReactNode; className?: string; icon?: LucideIcon }) {
  return <section className={`section-card ${className}`}>
    {(title || action) && <div className="mb-3 flex items-center justify-between gap-3">{title && <h2 className="flex items-center gap-2 text-lg font-bold">{Icon && <Icon className="text-[var(--primary)]" size={20} aria-hidden />}{title}</h2>}{action}</div>}
    {children}
  </section>;
}

export function StatCard({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return <div className="stat-card"><div className="stat-label">{label}</div><div className="stat-value">{value}</div>{detail && <div className="mt-1 text-xs text-[var(--muted)]">{detail}</div>}</div>;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  const generatedId = useId();
  const child = isValidElement<{ id?: string; required?: boolean; 'aria-describedby'?: string; 'aria-invalid'?: boolean; 'aria-errormessage'?: string }>(children) ? children : null;
  const controlId = child?.props.id ?? `field-${generatedId.replaceAll(':', '')}`;
  const descriptionId = hint || error ? `${controlId}-description` : undefined;
  const control = child
    ? cloneElement(child as ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean; 'aria-errormessage'?: string }>, {
        id: controlId,
        'aria-describedby': child.props['aria-describedby'] ?? descriptionId,
        'aria-invalid': child.props['aria-invalid'] ?? Boolean(error),
        'aria-errormessage': child.props['aria-errormessage'] ?? (error ? descriptionId : undefined),
      })
    : children;
  return <div className="field"><div className="field-label-row"><label className="field-label" htmlFor={controlId}>{label}</label>{child?.props.required && <span className="field-required" aria-hidden>Obrigatório</span>}</div>{control}{(hint || error) && <div id={descriptionId}>{hint && <span className="field-hint block">{hint}</span>}{error && <span className="field-error">{error}</span>}</div>}</div>;
}

export function FormErrorSummary({ errors }: { errors: Array<string | undefined> }) {
  const count = errors.filter(Boolean).length;
  const ref = useRef<HTMLDivElement>(null);
  const previousCount = useRef(0);
  useEffect(() => {
    if (count > previousCount.current) ref.current?.focus();
    previousCount.current = count;
  }, [count]);
  if (!count) return null;
  return <div ref={ref} className="notice notice-error form-error-summary" role="alert" tabIndex={-1}><strong>Revise os campos destacados</strong><span>{count === 1 ? 'Há 1 campo que precisa de correção.' : `Há ${count} campos que precisam de correção.`}</span></div>;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} aria-keyshortcuts={props['aria-keyshortcuts'] ?? (props.type === 'search' ? '/' : undefined)} className={`input ${props.className || ''}`} />; }
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} className={`input ${props.className || ''}`} />; }
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...props} className={`input min-h-24 resize-y ${props.className || ''}`} />; }

export function ChoiceCard({ name, value, checked, onChange, title, description }: { name: string; value: string; checked: boolean; onChange: () => void; title: string; description: string }) {
  return <label className={`choice-card ${checked ? 'choice-card-active' : ''}`}>
    <input type="radio" name={name} value={value} checked={checked} onChange={onChange} />
    <span><strong>{title}</strong><small>{description}</small></span>
  </label>;
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const variantClass = { primary: 'button-primary', secondary: 'button-secondary', danger: 'button-danger' }[variant];
  return <button {...props} className={`button ${variantClass} ${className}`} />;
}

export function LoadingState() { return <div className="section-card py-10 text-center text-[var(--muted)]" role="status">Carregando…</div>; }
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="section-card py-10 text-center"><h2 className="font-bold">{title}</h2><p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">{description}</p>{action && <div className="mt-4">{action}</div>}</div>;
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="notice notice-error" role="alert"><p className="whitespace-pre-line">{message}</p>{retry && <Button variant="secondary" className="mt-3" onClick={retry}>Tentar novamente</Button>}</div>;
}

export function Badge({ tone = 'neutral', children }: { tone?: 'success' | 'warning' | 'danger' | 'neutral'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="filter-bar">{children}</div>;
}

export function ScrollArea({ children, label, className = '' }: { children: ReactNode; label: string; className?: string }) {
  return <div className={`scroll-area ${className}`} tabIndex={0} role="region" aria-label={label}>{children}</div>;
}

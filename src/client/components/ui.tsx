import { cloneElement, isValidElement, useId } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactElement, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

export function PageHeader({ title, subtitle, action, icon: Icon }: { title: string; subtitle?: string; action?: ReactNode; icon?: LucideIcon }) {
  return <header className="page-header"><div><h1 className="page-title">{Icon && <Icon className="title-icon" size={28} strokeWidth={2.2} aria-hidden />}{title}</h1>{subtitle && <p className="page-subtitle">{subtitle}</p>}</div>{action}</header>;
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
  const child = isValidElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>(children) ? children : null;
  const controlId = child?.props.id ?? `field-${generatedId.replaceAll(':', '')}`;
  const descriptionId = hint || error ? `${controlId}-description` : undefined;
  const control = child
    ? cloneElement(child as ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>, {
        id: controlId,
        'aria-describedby': child.props['aria-describedby'] ?? descriptionId,
        'aria-invalid': child.props['aria-invalid'] ?? Boolean(error),
      })
    : children;
  return <div className="field"><label className="field-label" htmlFor={controlId}>{label}</label>{control}{(hint || error) && <div id={descriptionId}>{hint && <span className="field-hint block">{hint}</span>}{error && <span className="text-sm text-[var(--danger)]">{error}</span>}</div>}</div>;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={`input ${props.className || ''}`} />; }
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} className={`input ${props.className || ''}`} />; }
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...props} className={`input min-h-24 resize-y ${props.className || ''}`} />; }

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return <button {...props} className={`button button-${variant} ${className}`} />;
}

export function LoadingState() { return <div className="section-card py-10 text-center text-[var(--muted)]" role="status">Carregando…</div>; }
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="section-card py-10 text-center"><h2 className="font-bold">{title}</h2><p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">{description}</p>{action && <div className="mt-4">{action}</div>}</div>;
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="notice notice-error" role="alert"><p>{message}</p>{retry && <Button variant="secondary" className="mt-3" onClick={retry}>Tentar novamente</Button>}</div>;
}

export function Badge({ tone = 'neutral', children }: { tone?: 'success' | 'warning' | 'danger' | 'neutral'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function ConfirmButton({ question, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { question: string; variant?: 'primary' | 'secondary' | 'danger' }) {
  return <Button {...props} onClick={(event) => { if (!window.confirm(question)) return; props.onClick?.(event); }} />;
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="filter-bar">{children}</div>;
}

export function ScrollArea({ children, label, className = '' }: { children: ReactNode; label: string; className?: string }) {
  return <div className={`scroll-area ${className}`} tabIndex={0} role="region" aria-label={label}>{children}</div>;
}

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';

export type ReviewAccent = 'action' | 'ok' | 'dismissed';

/**
 * Cartão de revisão: uma DECISÃO, não um formulário. Recolhido por padrão, com
 * uma faixa colorida à esquerda para triagem (âmbar = precisa de você, verde =
 * ok, cinza = descartado), um problema em destaque (+N para o resto) e uma barra
 * de ações. O editor entra pelo slot `children`, aberto sob demanda.
 */
export function ReviewCard({
  title,
  subtitle,
  value,
  badge,
  accent,
  issues = [],
  children,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  badge?: ReactNode;
  accent: ReviewAccent;
  issues?: string[];
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const [showAllIssues, setShowAllIssues] = useState(false);
  const [headline, ...rest] = issues;
  return <div className={`review-card review-card--${accent}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <strong className="block truncate">{title}</strong>
        {subtitle && <p className="mt-0.5 text-xs text-[var(--muted)]">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
        {value !== undefined && <span className="review-card-value">{value}</span>}
        {badge}
      </div>
    </div>
    {headline && <div className="mt-3 flex items-start gap-2 text-sm text-[var(--warning)]">
      <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <span>{headline}</span>
        {rest.length > 0 && !showAllIssues && <button type="button" className="ml-1 font-bold underline" onClick={() => setShowAllIssues(true)}>+{rest.length}</button>}
        {showAllIssues && <ul className="mt-1 list-disc pl-4">{rest.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
      </div>
    </div>}
    {children && <div className="mt-3">{children}</div>}
    {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
  </div>;
}

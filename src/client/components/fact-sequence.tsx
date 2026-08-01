import type { ReactNode } from 'react';

export type FactSequenceTone = 'neutral' | 'current' | 'complete' | 'warning';

export type FactSequenceItem = {
  key: string;
  label: string;
  description?: string;
  tone?: FactSequenceTone;
  content?: ReactNode;
};

/**
 * Ordem compartilhada para revisões de fatos: mostra de onde o dado veio,
 * como foi contextualizado e o que será efetivamente confirmado.
 */
export function FactSequence({ items, label = 'Ordem da revisão', className = '' }: {
  items: FactSequenceItem[];
  label?: string;
  className?: string;
}) {
  return <ol className={`fact-sequence ${className}`.trim()} aria-label={label}>
    {items.map((item, index) => <li className="fact-sequence-item" data-tone={item.tone ?? 'neutral'} key={item.key}>
      <span className="fact-sequence-marker" aria-hidden>{index + 1}</span>
      <div className="fact-sequence-copy">
        <strong>{item.label}</strong>
        {item.description && <small>{item.description}</small>}
        {item.content && <div className="fact-sequence-content">{item.content}</div>}
      </div>
    </li>)}
  </ol>;
}

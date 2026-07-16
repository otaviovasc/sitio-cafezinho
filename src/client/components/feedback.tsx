import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { Button } from './ui';
import { FeedbackContext, useConfirm } from './feedback-context';
import type { ConfirmationInput, ToastInput, ToastTone } from './feedback-context';

type ToastItem = Required<Pick<ToastInput, 'title' | 'tone' | 'duration'>> & Pick<ToastInput, 'message'> & { id: number };
type PendingConfirmation = ConfirmationInput & { resolve: (accepted: boolean) => void };

export function Modal({ open, title, description, children, footer, onClose }: {
  open: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => {
      const preferred = panelRef.current?.querySelector<HTMLElement>('[data-autofocus]');
      const first = panelRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      (preferred ?? first ?? panelRef.current)?.focus();
    }, 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panelRef} className="modal-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} tabIndex={-1}>
        <div className="modal-header">
          <div className="min-w-0">
            <h2 id={titleId} className="text-xl font-bold tracking-tight">{title}</h2>
            {description && <p id={descriptionId} className="mt-1 text-sm leading-5 text-[var(--muted)]">{description}</p>}
          </div>
          <button className="modal-close" type="button" aria-label="Fechar" onClick={onClose}><X size={20} aria-hidden /></button>
        </div>
        {children && <div className="modal-body">{children}</div>}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

function ToastIcon({ tone }: { tone: ToastTone }) {
  if (tone === 'success') return <CheckCircle2 size={20} aria-hidden />;
  if (tone === 'warning') return <AlertTriangle size={20} aria-hidden />;
  return <Info size={20} aria-hidden />;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const nextToastId = useRef(0);
  const timers = useRef(new Map<number, number>());

  const removeToast = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((input: ToastInput | string) => {
    const normalized = typeof input === 'string' ? { title: input } : input;
    const item: ToastItem = {
      id: ++nextToastId.current,
      title: normalized.title,
      message: normalized.message,
      tone: normalized.tone ?? 'success',
      duration: normalized.duration ?? 1500,
    };
    setToasts((current) => {
      const duplicates = current.filter((existing) => existing.title === item.title && existing.message === item.message && existing.tone === item.tone);
      for (const duplicate of duplicates) {
        const duplicateTimer = timers.current.get(duplicate.id);
        if (duplicateTimer) window.clearTimeout(duplicateTimer);
        timers.current.delete(duplicate.id);
      }
      const unique = current.filter((existing) => !duplicates.includes(existing));
      return [...unique.slice(-2), item];
    });
    const timer = window.setTimeout(() => removeToast(item.id), item.duration);
    timers.current.set(item.id, timer);
  }, [removeToast]);

  const confirm = useCallback((input: ConfirmationInput) => new Promise<boolean>((resolve) => {
    setConfirmation((current) => {
      current?.resolve(false);
      return { ...input, resolve };
    });
  }), []);

  const answerConfirmation = useCallback((accepted: boolean) => {
    setConfirmation((current) => {
      current?.resolve(accepted);
      return null;
    });
  }, []);

  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    setConfirmation((current) => {
      current?.resolve(false);
      return null;
    });
  }, []);

  return <FeedbackContext.Provider value={{ toast, confirm }}>
    {children}
    <div className="toast-region" aria-live="polite" aria-atomic="true">
      {toasts.map((item) => <div className={`toast toast-${item.tone}`} key={item.id} role="status">
        <ToastIcon tone={item.tone} />
        <div className="min-w-0 flex-1"><strong className="block text-sm">{item.title}</strong>{item.message && <span className="mt-0.5 block text-xs leading-4">{item.message}</span>}</div>
        <button type="button" className="toast-close" aria-label="Fechar aviso" onClick={() => removeToast(item.id)}><X size={16} aria-hidden /></button>
      </div>)}
    </div>
    <Modal
      open={Boolean(confirmation)}
      title={confirmation?.title ?? ''}
      description={confirmation?.description}
      onClose={() => answerConfirmation(false)}
      footer={<>
        <Button data-autofocus={confirmation?.tone === 'danger' || undefined} variant="secondary" onClick={() => answerConfirmation(false)}>{confirmation?.cancelLabel ?? 'Cancelar'}</Button>
        <Button data-autofocus={confirmation?.tone !== 'danger' || undefined} variant={confirmation?.tone === 'danger' ? 'danger' : 'primary'} onClick={() => answerConfirmation(true)}>{confirmation?.confirmLabel ?? 'Confirmar'}</Button>
      </>}
    />
  </FeedbackContext.Provider>;
}

export function ConfirmButton({ question, title, confirmLabel, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  question: string;
  title?: string;
  confirmLabel?: string;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const confirm = useConfirm();
  return <Button {...props} onClick={async (event) => {
    const accepted = await confirm({
      title: title ?? (props.variant === 'danger' ? 'Confirmar exclusão?' : 'Confirmar ação'),
      description: question,
      confirmLabel: confirmLabel ?? (props.variant === 'danger' ? 'Excluir' : 'Confirmar'),
      tone: props.variant === 'danger' ? 'danger' : 'primary',
    });
    if (accepted) props.onClick?.(event);
  }} />;
}

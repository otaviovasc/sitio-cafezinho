import { createContext, useContext } from 'react';

export type ToastTone = 'success' | 'info' | 'warning';
export type ToastInput = { title: string; message?: string; tone?: ToastTone; duration?: number };
export type ConfirmationInput = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
};

export type FeedbackContextValue = {
  toast: (input: ToastInput | string) => void;
  confirm: (input: ConfirmationInput) => Promise<boolean>;
};

export const FeedbackContext = createContext<FeedbackContextValue | null>(null);

function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error('FeedbackProvider não encontrado.');
  return context;
}

export function useToast() {
  return useFeedback().toast;
}

export function useConfirm() {
  return useFeedback().confirm;
}

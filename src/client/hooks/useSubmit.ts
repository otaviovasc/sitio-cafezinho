import { useCallback, useState } from 'react';
import { ApiError } from '../lib/api';

/**
 * Padroniza o envio de um formulário: estado de ocupado, captura de erro
 * (mensagem amigável do ApiError) e limpeza. Remove o try/finally repetido em
 * cada tela. A validação de campos e o sucesso (toast, navegação) ficam com o
 * formulário, dentro da tarefa passada para `run`.
 */
export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = useCallback(async (task: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (cause) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.');
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, setError, run };
}

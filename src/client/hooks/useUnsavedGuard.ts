import { useEffect } from 'react';

/**
 * Protege contra perda de dados: avisa antes de recarregar ou fechar a aba com
 * um formulário com alterações não salvas. (O bloqueio da navegação interna do
 * SPA exige o data router do react-router e fica para uma etapa dedicada.)
 */
export function useUnsavedGuard(active: boolean) {
  useEffect(() => {
    if (!active) return undefined;
    const handler = (event: BeforeUnloadEvent) => {
      // Navegadores modernos exibem o aviso apenas com preventDefault().
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);
}

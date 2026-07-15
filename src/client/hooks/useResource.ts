import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

export function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try { setData(await api<T>(path)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar.'); }
    finally { if (showLoading) setLoading(false); }
  }, [path]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, setData, error, loading, reload };
}

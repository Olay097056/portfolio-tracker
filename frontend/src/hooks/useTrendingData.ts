import { useCallback, useState } from 'react';
import { getTrending } from '../api/client';
import type { TrendingData } from '../api/types';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useTrendingData() {
  const [data, setData] = useState<TrendingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getTrending();
      setData(result);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, refresh };
}

export type TrendingDataState = ReturnType<typeof useTrendingData>;

import { useCallback, useEffect, useState } from 'react';
import { getPortfolioSummary } from '../api/client';
import type { PortfolioSummary } from '../api/types';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function usePortfolioSummary(portfolioId: number) {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPortfolioSummary(portfolioId);
      setSummary(data);
    } catch (err) {
      setError(toMessage(err));
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { summary, loading, error, refetch };
}

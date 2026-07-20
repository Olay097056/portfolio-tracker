// frontend/src/hooks/usePortfolios.ts
import { useCallback, useEffect, useState } from 'react';
import { createPortfolio, deletePortfolio, listPortfolios, updatePortfolio } from '../api/client';
import type { Portfolio, PortfolioCreateInput, PortfolioUpdateInput } from '../api/types';

export function usePortfolios() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPortfolios();
      setPortfolios(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const create = useCallback(
    async (input: PortfolioCreateInput) => {
      await createPortfolio(input);
      await refetch();
    },
    [refetch],
  );

  const update = useCallback(
    async (id: number, input: PortfolioUpdateInput) => {
      await updatePortfolio(id, input);
      await refetch();
    },
    [refetch],
  );

  const remove = useCallback(
    async (id: number) => {
      await deletePortfolio(id);
      await refetch();
    },
    [refetch],
  );

  return { portfolios, loading, error, create, update, remove };
}

import { useCallback, useEffect, useState } from 'react';
import { createPortfolio, deletePortfolio, listPortfolios, updatePortfolio } from '../api/client';
import type { Portfolio, PortfolioCreateInput, PortfolioUpdateInput } from '../api/types';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

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
      setError(toMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const create = useCallback(
    async (input: PortfolioCreateInput) => {
      try {
        await createPortfolio(input);
        setError(null);
        await refetch();
      } catch (err) {
        setError(toMessage(err));
        throw err;
      }
    },
    [refetch],
  );

  const update = useCallback(
    async (id: number, input: PortfolioUpdateInput) => {
      try {
        await updatePortfolio(id, input);
        setError(null);
        await refetch();
      } catch (err) {
        setError(toMessage(err));
        throw err;
      }
    },
    [refetch],
  );

  const remove = useCallback(
    async (id: number) => {
      try {
        await deletePortfolio(id);
        setError(null);
        await refetch();
      } catch (err) {
        setError(toMessage(err));
        throw err;
      }
    },
    [refetch],
  );

  return { portfolios, loading, error, create, update, remove };
}

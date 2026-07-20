// frontend/src/hooks/useHoldings.ts
import { useCallback, useEffect, useState } from 'react';
import { createHolding, deleteHolding, listHoldings, updateHolding } from '../api/client';
import type { Holding, HoldingCreateInput, HoldingUpdateInput } from '../api/types';

export function useHoldings(portfolioId: number) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listHoldings(portfolioId);
      setHoldings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const create = useCallback(
    async (input: HoldingCreateInput) => {
      await createHolding(portfolioId, input);
      await refetch();
    },
    [portfolioId, refetch],
  );

  const update = useCallback(
    async (holdingId: number, input: HoldingUpdateInput) => {
      await updateHolding(portfolioId, holdingId, input);
      await refetch();
    },
    [portfolioId, refetch],
  );

  const remove = useCallback(
    async (holdingId: number) => {
      await deleteHolding(portfolioId, holdingId);
      await refetch();
    },
    [portfolioId, refetch],
  );

  return { holdings, loading, error, create, update, remove };
}

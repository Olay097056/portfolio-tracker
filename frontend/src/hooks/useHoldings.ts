// frontend/src/hooks/useHoldings.ts
import { useCallback, useEffect, useState } from 'react';
import { createHolding, deleteHolding, listHoldings, updateHolding } from '../api/client';
import type { Holding, HoldingCreateInput, HoldingUpdateInput } from '../api/types';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

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
      setError(toMessage(err));
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const create = useCallback(
    async (input: HoldingCreateInput) => {
      try {
        await createHolding(portfolioId, input);
        setError(null);
        await refetch();
      } catch (err) {
        setError(toMessage(err));
        throw err;
      }
    },
    [portfolioId, refetch],
  );

  const update = useCallback(
    async (holdingId: number, input: HoldingUpdateInput) => {
      try {
        await updateHolding(portfolioId, holdingId, input);
        setError(null);
        await refetch();
      } catch (err) {
        setError(toMessage(err));
        throw err;
      }
    },
    [portfolioId, refetch],
  );

  const remove = useCallback(
    async (holdingId: number) => {
      try {
        await deleteHolding(portfolioId, holdingId);
        setError(null);
        await refetch();
      } catch (err) {
        setError(toMessage(err));
        throw err;
      }
    },
    [portfolioId, refetch],
  );

  return { holdings, loading, error, create, update, remove };
}

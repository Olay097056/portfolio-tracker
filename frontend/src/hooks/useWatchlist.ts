import { useCallback, useEffect, useState } from 'react';
import { createWatchlistItem, deleteWatchlistItem, listWatchlist } from '../api/client';
import type { WatchlistItem, WatchlistItemCreateInput } from '../api/types';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useWatchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listWatchlist();
      setItems(data);
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
    async (input: WatchlistItemCreateInput) => {
      try {
        await createWatchlistItem(input);
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
        await deleteWatchlistItem(id);
        setError(null);
        await refetch();
      } catch (err) {
        setError(toMessage(err));
        throw err;
      }
    },
    [refetch],
  );

  return { items, loading, error, create, remove };
}

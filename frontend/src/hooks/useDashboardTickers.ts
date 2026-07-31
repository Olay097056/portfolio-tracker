// frontend/src/hooks/useDashboardTickers.ts
import { useEffect, useState } from 'react';
import { listHoldings } from '../api/client';
import { usePortfolios } from './usePortfolios';
import { useWatchlist } from './useWatchlist';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useDashboardTickers() {
  const { portfolios, loading: portfoliosLoading, error: portfoliosError } = usePortfolios();
  const { items: watchlistItems, loading: watchlistLoading, error: watchlistError } = useWatchlist();
  const [holdingTickers, setHoldingTickers] = useState<string[]>([]);
  const [holdingsLoading, setHoldingsLoading] = useState(true);
  const [holdingsError, setHoldingsError] = useState<string | null>(null);

  useEffect(() => {
    if (portfoliosLoading) return;

    if (portfolios.length === 0) {
      setHoldingTickers([]);
      setHoldingsLoading(false);
      setHoldingsError(null);
      return;
    }

    let cancelled = false;
    setHoldingsLoading(true);
    setHoldingsError(null);

    Promise.all(portfolios.map((portfolio) => listHoldings(portfolio.id)))
      .then((results) => {
        if (cancelled) return;
        setHoldingTickers(results.flat().map((holding) => holding.ticker));
      })
      .catch((err) => {
        if (cancelled) return;
        setHoldingTickers([]);
        setHoldingsError(toMessage(err));
      })
      .finally(() => {
        if (cancelled) return;
        setHoldingsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [portfolios, portfoliosLoading]);

  const tickers = Array.from(new Set([...holdingTickers, ...watchlistItems.map((item) => item.ticker)])).sort();
  const loading = portfoliosLoading || watchlistLoading || holdingsLoading;
  const error = portfoliosError ?? watchlistError ?? holdingsError;

  return { tickers, loading, error };
}

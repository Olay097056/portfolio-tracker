// frontend/src/hooks/useDashboardTickers.ts
import { useEffect, useState } from 'react';
import { listHoldings } from '../api/client';
import { usePortfolios } from './usePortfolios';
import { useWatchlist } from './useWatchlist';

export function useDashboardTickers() {
  const { portfolios, loading: portfoliosLoading } = usePortfolios();
  const { items: watchlistItems, loading: watchlistLoading } = useWatchlist();
  const [holdingTickers, setHoldingTickers] = useState<string[]>([]);
  const [holdingsLoading, setHoldingsLoading] = useState(true);

  useEffect(() => {
    if (portfoliosLoading) return;

    if (portfolios.length === 0) {
      setHoldingTickers([]);
      setHoldingsLoading(false);
      return;
    }

    let cancelled = false;
    setHoldingsLoading(true);

    Promise.all(portfolios.map((portfolio) => listHoldings(portfolio.id)))
      .then((results) => {
        if (cancelled) return;
        setHoldingTickers(results.flat().map((holding) => holding.ticker));
      })
      .catch(() => {
        if (cancelled) return;
        setHoldingTickers([]);
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

  return { tickers, loading };
}

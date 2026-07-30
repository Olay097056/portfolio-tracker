// frontend/src/pages/DashboardPage.tsx
import { useState } from 'react';
import { PriceChart } from '../components/PriceChart';
import { useChartData } from '../hooks/useChartData';
import { useDashboardTickers } from '../hooks/useDashboardTickers';

const RANGE = '1Y' as const;

export function DashboardPage() {
  const { tickers, loading: tickersLoading } = useDashboardTickers();
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const { points, loading, error } = useChartData(selectedTicker, RANGE);

  return (
    <div>
      <h2>Dashboard</h2>

      {tickersLoading ? (
        <div>Loading tickers…</div>
      ) : tickers.length === 0 ? (
        <p>No tickers to chart yet — add a holding or a Watchlist ticker first.</p>
      ) : (
        <>
          <label htmlFor="dashboard-ticker">Ticker</label>
          <select id="dashboard-ticker" value={selectedTicker ?? ''} onChange={(e) => setSelectedTicker(e.target.value || null)}>
            <option value="">Select a ticker…</option>
            {tickers.map((ticker) => (
              <option key={ticker} value={ticker}>
                {ticker}
              </option>
            ))}
          </select>

          {selectedTicker && <PriceChart points={points} loading={loading} error={error} />}
        </>
      )}
    </div>
  );
}

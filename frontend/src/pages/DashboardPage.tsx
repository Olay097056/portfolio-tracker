// frontend/src/pages/DashboardPage.tsx
import { useState } from 'react';
import { PriceChart } from '../components/PriceChart';
import { chartIdentityKey, useChartData } from '../hooks/useChartData';
import { useDashboardTickers } from '../hooks/useDashboardTickers';
import type { ChartRange } from '../api/types';

const RANGES: { value: ChartRange; label: string }[] = [
  { value: '1D', label: '1 day' },
  { value: '5D', label: '5 days' },
  { value: '1M', label: '1 month' },
  { value: '6M', label: '6 months' },
  { value: 'YTD', label: 'Year to date' },
  { value: '1Y', label: '1 year' },
  { value: '5Y', label: '5 years' },
];

export function DashboardPage() {
  const { tickers, loading: tickersLoading, error: tickersError } = useDashboardTickers();
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [range, setRange] = useState<ChartRange>('1Y');
  const { points, loading, error, zones } = useChartData(selectedTicker, range);

  return (
    <div>
      <h2>Dashboard</h2>

      {tickersError ? (
        <div role="alert">{tickersError}</div>
      ) : tickersLoading ? (
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

          {selectedTicker && (
            <>
              <label htmlFor="dashboard-range">Range</label>
              <select id="dashboard-range" value={range} onChange={(e) => setRange(e.target.value as ChartRange)}>
                {RANGES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>

              <PriceChart key={chartIdentityKey(selectedTicker, range)} points={points} loading={loading} error={error} zones={zones} />
            </>
          )}
        </>
      )}
    </div>
  );
}

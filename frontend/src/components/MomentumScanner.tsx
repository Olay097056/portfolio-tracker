// frontend/src/components/MomentumScanner.tsx
import { useState } from 'react';
import type { PriceSignalRow, ScanPeriod } from '../api/types';
import { useWatchlist } from '../hooks/useWatchlist';

interface PriceSignalsScanState {
  results: Record<string, PriceSignalRow>;
  scanning: boolean;
  progress: { done: number; total: number } | null;
  scan: (tickers: string[], period: ScanPeriod) => Promise<void>;
}

interface MomentumScannerProps {
  scanState: PriceSignalsScanState;
}

type SortDirection = 'asc' | 'desc';

export function MomentumScanner({ scanState }: MomentumScannerProps) {
  const { items, loading } = useWatchlist();
  const [period, setPeriod] = useState<ScanPeriod>('1w');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const { results, scanning, progress, scan } = scanState;

  if (loading) {
    return <div>Loading watchlist…</div>;
  }

  if (items.length === 0) {
    return (
      <div>
        <h3>Momentum Scanner</h3>
        <p>Your watchlist is empty — add tickers in Manage Watchlist before scanning.</p>
      </div>
    );
  }

  const rows = items
    .map((item) => results[item.ticker])
    .filter((row): row is PriceSignalRow => row !== undefined);

  const sortedRows = [...rows].sort((a, b) => {
    if (a.percent_change_pct === null) return 1;
    if (b.percent_change_pct === null) return -1;
    return sortDirection === 'asc' ? a.percent_change_pct - b.percent_change_pct : b.percent_change_pct - a.percent_change_pct;
  });

  async function handleScan() {
    await scan(
      items.map((item) => item.ticker),
      period,
    );
  }

  return (
    <div>
      <h3>Momentum Scanner</h3>

      <label htmlFor="momentum-period">Period</label>
      <select
        id="momentum-period"
        value={period}
        onChange={(e) => setPeriod(e.target.value as ScanPeriod)}
        disabled={scanning}
      >
        <option value="1d">1 day</option>
        <option value="1w">1 week</option>
        <option value="1m">1 month</option>
      </select>

      <button type="button" onClick={handleScan} disabled={scanning}>
        {scanning ? 'Scanning…' : 'Scan'}
      </button>

      {scanning && progress && (
        <div role="status">
          Scanning {progress.done} of {progress.total}…
        </div>
      )}

      {sortedRows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Ticker</th>
              <th>
                <button type="button" onClick={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}>
                  % change ({period})
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.ticker}>
                <td>{row.ticker}</td>
                <td>{row.percent_change_pct === null ? 'Unavailable' : `${row.percent_change_pct.toFixed(2)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

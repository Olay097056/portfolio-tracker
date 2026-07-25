// frontend/src/components/MomentumScanner.tsx
import { useState } from 'react';
import type { PriceSignalRow, ScanPeriod } from '../api/types';
import type { PriceSignalsScanState } from '../hooks/usePriceSignalsScan';
import { useWatchlist } from '../hooks/useWatchlist';

interface MomentumScannerProps {
  scanState: PriceSignalsScanState;
}

type SortColumn = 'percent_change_pct' | 'rsi_14' | 'volume_ratio' | 'distance_from_sma50_pct';
type SortDirection = 'asc' | 'desc';

function formatSignedPercent(value: number | null | undefined): string {
  return value == null ? 'Unavailable' : `${value.toFixed(2)}%`;
}

function formatNumber(value: number | null | undefined): string {
  return value == null ? 'Unavailable' : value.toFixed(2);
}

export function MomentumScanner({ scanState }: MomentumScannerProps) {
  const { items, loading } = useWatchlist();
  const [period, setPeriod] = useState<ScanPeriod>('1w');
  const [sortColumn, setSortColumn] = useState<SortColumn>('percent_change_pct');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const { results, scannedPeriod, scanning, progress, scan } = scanState;

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
    const aValue = a[sortColumn];
    const bValue = b[sortColumn];
    if (aValue == null) return 1;
    if (bValue == null) return -1;
    return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
  });

  function toggleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  }

  async function handleScan() {
    await scan(
      items.map((item) => item.ticker),
      period,
    );
  }

  const headingPeriod = scannedPeriod ?? period;

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
                <button type="button" onClick={() => toggleSort('percent_change_pct')}>
                  % change ({headingPeriod})
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort('rsi_14')}>
                  RSI (14)
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort('volume_ratio')}>
                  Volume vs 20-day avg
                </button>
              </th>
              <th>
                <button type="button" onClick={() => toggleSort('distance_from_sma50_pct')}>
                  Distance from SMA (50)
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.ticker}>
                <td>{row.ticker}</td>
                <td>{formatSignedPercent(row.percent_change_pct)}</td>
                <td>{formatNumber(row.rsi_14)}</td>
                <td>{formatNumber(row.volume_ratio)}</td>
                <td>{formatSignedPercent(row.distance_from_sma50_pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

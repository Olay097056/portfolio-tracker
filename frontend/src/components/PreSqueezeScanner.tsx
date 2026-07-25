// frontend/src/components/PreSqueezeScanner.tsx
import { useState } from 'react';
import type { PriceSignalRow } from '../api/types';
import type { PriceSignalsScanState } from '../hooks/usePriceSignalsScan';
import { useWatchlist } from '../hooks/useWatchlist';
import { formatNumber, formatSignedPercent } from '../utils/signalFormatting';

interface PreSqueezeScannerProps {
  scanState: PriceSignalsScanState;
}

type SortColumn = 'bb_width_pct' | 'bb_width_percentile' | 'atr_pct' | 'volume_ratio';
type SortDirection = 'asc' | 'desc';

export function PreSqueezeScanner({ scanState }: PreSqueezeScannerProps) {
  const { items, loading } = useWatchlist();
  const [sortColumn, setSortColumn] = useState<SortColumn>('bb_width_percentile');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const { results, scanning, progress, scan } = scanState;

  if (loading) {
    return <div>Loading watchlist…</div>;
  }

  if (items.length === 0) {
    return (
      <div>
        <h3>Pre-Squeeze Scanner</h3>
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
    if (aValue == null && bValue == null) return 0;
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

  function ariaSortFor(column: SortColumn): 'ascending' | 'descending' | undefined {
    if (sortColumn !== column) return undefined;
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  }

  async function handleScan() {
    // No period argument — Pre-Squeeze has no period selector and never displays
    // percent_change_pct, so the shared scan reuses whatever period Momentum last requested.
    await scan(items.map((item) => item.ticker));
  }

  return (
    <div>
      <h3>Pre-Squeeze Scanner</h3>

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
              <th aria-sort={ariaSortFor('bb_width_pct')}>
                <button type="button" onClick={() => toggleSort('bb_width_pct')}>
                  BB width (20, 2σ)
                </button>
              </th>
              <th aria-sort={ariaSortFor('bb_width_percentile')}>
                <button type="button" onClick={() => toggleSort('bb_width_percentile')}>
                  BB width percentile (6mo)
                </button>
              </th>
              <th aria-sort={ariaSortFor('atr_pct')}>
                <button type="button" onClick={() => toggleSort('atr_pct')}>
                  ATR (14)
                </button>
              </th>
              <th aria-sort={ariaSortFor('volume_ratio')}>
                <button type="button" onClick={() => toggleSort('volume_ratio')}>
                  Volume vs 20-day avg
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.ticker}>
                <td>{row.ticker}</td>
                <td>{formatSignedPercent(row.bb_width_pct)}</td>
                <td>{formatNumber(row.bb_width_percentile)}</td>
                <td>{formatSignedPercent(row.atr_pct)}</td>
                <td>{formatNumber(row.volume_ratio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

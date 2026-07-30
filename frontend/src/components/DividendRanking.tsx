// frontend/src/components/DividendRanking.tsx
import type { DividendSignalRow } from '../api/types';
import type { DividendScanState } from '../hooks/useDividendScan';
import { useSortableColumn } from '../hooks/useSortableColumn';
import { useWatchlist } from '../hooks/useWatchlist';
import { netYieldPct } from '../utils/dividendYield';
import { formatNumber, formatSignedPercent } from '../utils/signalFormatting';
import { sortByNullableNumber } from '../utils/sortRows';

interface DividendRankingProps {
  scanState: DividendScanState;
  taxRatePct: string;
  onTaxRatePctChange: (value: string) => void;
}

type SortColumn = 'price' | 'gross_yield_pct' | 'net_yield_pct' | 'payment_frequency' | 'dividend_growth_pct';

function sortValue(row: DividendSignalRow, column: SortColumn, taxRate: number): number | null {
  if (column === 'net_yield_pct') {
    return netYieldPct(row.gross_yield_pct, taxRate);
  }
  return row[column];
}

export function DividendRanking({ scanState, taxRatePct, onTaxRatePctChange }: DividendRankingProps) {
  const { items, loading } = useWatchlist();
  const { results, scanning, progress, scan } = scanState;
  const { sortColumn, toggleSort, sortDirection, ariaSortFor } = useSortableColumn<SortColumn>('net_yield_pct');

  if (loading) {
    return <div>Loading watchlist…</div>;
  }

  if (items.length === 0) {
    return (
      <div>
        <h3>Dividend Ranking</h3>
        <p>
          Your watchlist is empty — add tickers in Manage Watchlist, or add some instantly from Trending Stocks
          Today, before scanning.
        </p>
      </div>
    );
  }

  const rows = items.map((item) => results[item.ticker]).filter((row): row is DividendSignalRow => row !== undefined);
  // Clamped to a sane 0-100 range so an empty, negative, or >100 tax-rate entry can never
  // produce a net yield that exceeds gross yield or goes negative — a nonsensical number in a
  // tab whose only purpose is to report real figures.
  const taxRate = Math.min(100, Math.max(0, Number(taxRatePct) || 0));
  const sortedRows = sortByNullableNumber(rows, (row) => sortValue(row, sortColumn, taxRate), sortDirection);

  async function handleScan() {
    await scan(items.map((item) => item.ticker));
  }

  return (
    <div>
      <h3>Dividend Ranking</h3>

      <label htmlFor="dividend-tax-rate">Dividend tax rate (%)</label>
      <input
        id="dividend-tax-rate"
        type="number"
        min="0"
        max="100"
        value={taxRatePct}
        onChange={(e) => onTaxRatePctChange(e.target.value)}
      />

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
              <th aria-sort={ariaSortFor('price')}>
                <button type="button" onClick={() => toggleSort('price')}>
                  Price
                </button>
              </th>
              <th aria-sort={ariaSortFor('gross_yield_pct')}>
                <button type="button" onClick={() => toggleSort('gross_yield_pct')}>
                  Gross yield
                </button>
              </th>
              <th aria-sort={ariaSortFor('net_yield_pct')}>
                <button type="button" onClick={() => toggleSort('net_yield_pct')}>
                  Net yield
                </button>
              </th>
              <th aria-sort={ariaSortFor('payment_frequency')}>
                <button type="button" onClick={() => toggleSort('payment_frequency')}>
                  Payment frequency (12mo)
                </button>
              </th>
              <th aria-sort={ariaSortFor('dividend_growth_pct')}>
                <button type="button" onClick={() => toggleSort('dividend_growth_pct')}>
                  Dividend growth (YoY)
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.ticker}>
                <td>{row.ticker}</td>
                <td>{formatNumber(row.price)}</td>
                <td>{formatSignedPercent(row.gross_yield_pct)}</td>
                <td>{formatSignedPercent(netYieldPct(row.gross_yield_pct, taxRate))}</td>
                <td>{row.payment_frequency == null ? 'Unavailable' : row.payment_frequency}</td>
                <td>{formatSignedPercent(row.dividend_growth_pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

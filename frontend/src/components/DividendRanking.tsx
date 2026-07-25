// frontend/src/components/DividendRanking.tsx
import { useState } from 'react';
import { useDividendScan } from '../hooks/useDividendScan';
import { useWatchlist } from '../hooks/useWatchlist';
import { formatNumber, formatSignedPercent } from '../utils/signalFormatting';

export function DividendRanking() {
  const { items, loading } = useWatchlist();
  const [taxRatePct, setTaxRatePct] = useState('15');
  const { results, scanning, progress, scan } = useDividendScan();

  if (loading) {
    return <div>Loading watchlist…</div>;
  }

  if (items.length === 0) {
    return (
      <div>
        <h3>Dividend Ranking</h3>
        <p>Your watchlist is empty — add tickers in Manage Watchlist before scanning.</p>
      </div>
    );
  }

  const rows = items.map((item) => results[item.ticker]).filter((row) => row !== undefined);
  const taxRate = Number(taxRatePct) || 0;

  async function handleScan() {
    await scan(items.map((item) => item.ticker));
  }

  return (
    <div>
      <h3>Dividend Ranking</h3>

      <label htmlFor="dividend-tax-rate">Dividend tax rate (%)</label>
      <input id="dividend-tax-rate" type="number" value={taxRatePct} onChange={(e) => setTaxRatePct(e.target.value)} />

      <button type="button" onClick={handleScan} disabled={scanning}>
        {scanning ? 'Scanning…' : 'Scan'}
      </button>

      {scanning && progress && (
        <div role="status">
          Scanning {progress.done} of {progress.total}…
        </div>
      )}

      {rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Price</th>
              <th>Gross yield</th>
              <th>Net yield</th>
              <th>Payment frequency (12mo)</th>
              <th>Dividend growth (YoY)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const netYieldPct = row.gross_yield_pct == null ? null : row.gross_yield_pct * (1 - taxRate / 100);
              return (
                <tr key={row.ticker}>
                  <td>{row.ticker}</td>
                  <td>{formatNumber(row.price)}</td>
                  <td>{formatSignedPercent(row.gross_yield_pct)}</td>
                  <td>{formatSignedPercent(netYieldPct)}</td>
                  <td>{row.payment_frequency == null ? 'Unavailable' : row.payment_frequency}</td>
                  <td>{formatSignedPercent(row.dividend_growth_pct)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

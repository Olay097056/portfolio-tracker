import { useState } from 'react';
import { getPrices } from '../api/client';

interface EtfComparisonResult {
  ticker: string;
  priceUsd: number | null;
}

export function EtfComparisonTool() {
  const [tickerA, setTickerA] = useState('');
  const [tickerB, setTickerB] = useState('');
  const [results, setResults] = useState<EtfComparisonResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCompare() {
    setError(null);
    setResults(null);
    const a = tickerA.trim().toUpperCase();
    const b = tickerB.trim().toUpperCase();
    if (!a || !b) {
      setError('Enter both tickers to compare.');
      return;
    }
    try {
      const prices = await getPrices([a, b]);
      setResults([
        { ticker: a, priceUsd: prices[a] ?? null },
        { ticker: b, priceUsd: prices[b] ?? null },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="card">
      <h3>ETF Comparison</h3>
      {error && <div role="alert">{error}</div>}

      <label htmlFor="etf-a">Ticker A</label>
      <input id="etf-a" value={tickerA} onChange={(e) => setTickerA(e.target.value)} />

      <label htmlFor="etf-b">Ticker B</label>
      <input id="etf-b" value={tickerB} onChange={(e) => setTickerB(e.target.value)} />

      <button type="button" onClick={handleCompare}>
        Compare
      </button>

      {results && (
        <table className="zebra-table">
          <tbody>
            {results.map((r) => (
              <tr key={r.ticker}>
                <td>{r.ticker}</td>
                <td>{r.priceUsd !== null ? `$${r.priceUsd.toFixed(2)}` : 'Price unavailable'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

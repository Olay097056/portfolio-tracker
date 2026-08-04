import type { TrendingRow } from '../api/types';
import type { TrendingDataState } from '../hooks/useTrendingData';
import { useWatchlist } from '../hooks/useWatchlist';
import { changeColor, formatNumber, formatSignedPercent } from '../utils/signalFormatting';

interface TrendingStocksTodayProps {
  scanState: TrendingDataState;
}

interface TrendingListProps {
  title: string;
  rows: TrendingRow[] | null;
  watchedTickers: Set<string>;
  onAdd: (ticker: string) => void;
}

function TrendingList({ title, rows, watchedTickers, onAdd }: TrendingListProps) {
  return (
    <div>
      <h4>{title}</h4>
      {rows === null ? (
        <p>This list could not be fetched — try refreshing again shortly.</p>
      ) : rows.length === 0 ? (
        <p>No data.</p>
      ) : (
        <table className="zebra-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Name</th>
              <th>Price</th>
              <th>% change</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.ticker}>
                <td>{row.ticker}</td>
                <td>{row.name}</td>
                <td>{formatNumber(row.price)}</td>
                <td style={{ color: changeColor(row.change_pct) }}>{formatSignedPercent(row.change_pct)}</td>
                <td>
                  {watchedTickers.has(row.ticker) ? (
                    <span>Already watched</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onAdd(row.ticker)}
                      style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
                    >
                      Add to Watchlist
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function TrendingStocksToday({ scanState }: TrendingStocksTodayProps) {
  const { items, loading: watchlistLoading, error: watchlistError, create } = useWatchlist();
  const { data, loading, error, refresh } = scanState;

  if (watchlistLoading) {
    return <div>Loading watchlist…</div>;
  }

  const watchedTickers = new Set(items.map((item) => item.ticker));

  async function handleAdd(ticker: string) {
    try {
      await create({ ticker });
    } catch {
      // Already surfaced via watchlistError below; swallow here so a rejected click doesn't
      // become an unhandled promise rejection.
    }
  }

  return (
    <div className="card">
      <h3>Trending Stocks Today</h3>

      <button type="button" onClick={refresh} disabled={loading}>
        {loading ? 'Refreshing…' : 'Refresh'}
      </button>

      {error && <div role="alert">{error}</div>}
      {watchlistError && <div role="alert">{watchlistError}</div>}

      {data && !data.api_key_configured && (
        <p>Set the FMP_API_KEY environment variable to enable Trending Stocks Today.</p>
      )}

      {data && data.api_key_configured && (
        <>
          <TrendingList title="Gainers" rows={data.gainers} watchedTickers={watchedTickers} onAdd={handleAdd} />
          <TrendingList title="Losers" rows={data.losers} watchedTickers={watchedTickers} onAdd={handleAdd} />
          <TrendingList title="Most active" rows={data.most_active} watchedTickers={watchedTickers} onAdd={handleAdd} />
        </>
      )}
    </div>
  );
}

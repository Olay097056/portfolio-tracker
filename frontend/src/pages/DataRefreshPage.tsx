import { RefreshStatusCard } from '../components/RefreshStatusCard';
import { getScreenerRefreshStatus, startScreenerRefresh } from '../api/client';

export function DataRefreshPage() {
  return (
    <RefreshStatusCard
      title="Stock Screener Data"
      description="Refreshes the Stock Screener's cached fundamentals for the full NASDAQ+NYSE+AMEX common-stock
      universe from Finnhub. This takes several hours — you can leave this tab and come back, the
      refresh keeps running on the server in the background."
      startLabel="Refresh Screener Data"
      runningLabel="Refresh in progress…"
      completedLabel="Screener data refreshed"
      itemNoun="symbols"
      getStatus={getScreenerRefreshStatus}
      startRefresh={startScreenerRefresh}
    />
  );
}

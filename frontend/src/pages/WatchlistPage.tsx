import { useState } from 'react';
import { TabStrip } from '../components/TabStrip';
import { DividendRanking } from '../components/DividendRanking';
import { TrendingStocksToday } from '../components/TrendingStocksToday';
import { useDividendScan } from '../hooks/useDividendScan';
import { useTrendingData } from '../hooks/useTrendingData';
import { WatchlistManagementPage } from './WatchlistManagementPage';

type WatchlistTab = 'manage' | 'dividend-ranking' | 'trending';

const TABS = [
  { id: 'manage', label: 'Manage Watchlist' },
  { id: 'dividend-ranking', label: 'Dividend Ranking' },
  { id: 'trending', label: 'Trending Stocks Today' },
] as const satisfies { id: WatchlistTab; label: string }[];

export function WatchlistPage() {
  const [activeTab, setActiveTab] = useState<WatchlistTab>('manage');
  const dividendScan = useDividendScan();
  const trendingData = useTrendingData();
  const [dividendTaxRatePct, setDividendTaxRatePct] = useState('15');

  return (
    <div>
      <h2>Watchlist</h2>
      <TabStrip tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === 'manage' && <WatchlistManagementPage />}
      {activeTab === 'dividend-ranking' && (
        <DividendRanking scanState={dividendScan} taxRatePct={dividendTaxRatePct} onTaxRatePctChange={setDividendTaxRatePct} />
      )}
      {activeTab === 'trending' && <TrendingStocksToday scanState={trendingData} />}
    </div>
  );
}

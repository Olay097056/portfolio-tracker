import { useState } from 'react';
import { TabStrip } from './components/TabStrip';
import { PortfoliosPage } from './pages/PortfoliosPage';
import { ToolsPage } from './pages/ToolsPage';
import { WatchlistPage } from './pages/WatchlistPage';

type Tab = 'portfolios' | 'tools' | 'watchlist';

const TABS = [
  { id: 'portfolios', label: 'Portfolios' },
  { id: 'tools', label: 'Tools' },
  { id: 'watchlist', label: 'Watchlist' },
] as const satisfies { id: Tab; label: string }[];

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('portfolios');

  return (
    <div>
      <h1>Portfolio Tracker</h1>
      <TabStrip tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === 'portfolios' && <PortfoliosPage />}
      {activeTab === 'tools' && <ToolsPage />}
      {activeTab === 'watchlist' && <WatchlistPage />}
    </div>
  );
}

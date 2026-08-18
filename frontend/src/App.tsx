import { useState } from 'react';
import { TabStrip } from './components/TabStrip';
import { ThemeToggle } from './components/ui/ThemeToggle';
import { DashboardPage } from './pages/DashboardPage';
import { PortfoliosPage } from './pages/PortfoliosPage';
import { BondCrisisPage } from './pages/BondCrisisPage';
import { ToolsPage } from './pages/ToolsPage';
import { WatchlistPage } from './pages/WatchlistPage';

type Tab = 'dashboard' | 'bond-crisis' | 'portfolios' | 'tools' | 'watchlist';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'bond-crisis', label: 'Bond-crisis' },
  { id: 'portfolios', label: 'Portfolios' },
  { id: 'tools', label: 'Tools' },
  { id: 'watchlist', label: 'Watchlist' },
] as const satisfies { id: Tab; label: string }[];

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('portfolios');

  return (
    <div className="app-container">
      <header className="app-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px rgba(56, 189, 248, 0.4)'
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline>
              <polyline points="16 7 22 7 22 13"></polyline>
            </svg>
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.6rem', lineHeight: '1.2' }}>Portfolio Tracker</h1>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>US Equities & ETF Analytics</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ThemeToggle />
          <span className="badge badge-green" style={{ padding: '4px 10px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 8px #10b981' }}></span>
            Live Market Server
          </span>
        </div>
      </header>

      <TabStrip tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
      
      <main className="tab-content">
        {activeTab === 'dashboard' && <DashboardPage />}
        {activeTab === 'bond-crisis' && <BondCrisisPage />}
        {activeTab === 'portfolios' && <PortfoliosPage />}
        {activeTab === 'tools' && <ToolsPage />}
        {activeTab === 'watchlist' && <WatchlistPage />}
      </main>
    </div>
  );
}

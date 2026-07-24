import { useState } from 'react';
import { PortfoliosPage } from './pages/PortfoliosPage';
import { ToolsPage } from './pages/ToolsPage';

type Tab = 'portfolios' | 'tools';

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('portfolios');

  return (
    <div>
      <h1>Portfolio Tracker</h1>
      <nav>
        <button type="button" aria-pressed={activeTab === 'portfolios'} onClick={() => setActiveTab('portfolios')}>
          Portfolios
        </button>
        <button type="button" aria-pressed={activeTab === 'tools'} onClick={() => setActiveTab('tools')}>
          Tools
        </button>
      </nav>
      {activeTab === 'portfolios' && <PortfoliosPage />}
      {activeTab === 'tools' && <ToolsPage />}
    </div>
  );
}

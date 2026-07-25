// frontend/src/pages/WatchlistPage.tsx
import { useState } from 'react';
import { TabStrip } from '../components/TabStrip';
import { DividendRanking } from '../components/DividendRanking';
import { MomentumScanner } from '../components/MomentumScanner';
import { PreSqueezeScanner } from '../components/PreSqueezeScanner';
import { usePriceSignalsScan } from '../hooks/usePriceSignalsScan';
import { WatchlistManagementPage } from './WatchlistManagementPage';

type WatchlistTab = 'manage' | 'momentum' | 'pre-squeeze' | 'dividend-ranking';

// "Manage Watchlist", not "Watchlist" — the top-level nav button in App.tsx is already labelled
// "Watchlist"; a same-labelled sub-tab button would make getByRole('button', { name: 'Watchlist' })
// ambiguous in tests (both buttons render at once) and confusing for a screen-reader user.
const TABS = [
  { id: 'manage', label: 'Manage Watchlist' },
  { id: 'momentum', label: 'Momentum Scanner' },
  { id: 'pre-squeeze', label: 'Pre-Squeeze Scanner' },
  { id: 'dividend-ranking', label: 'Dividend Ranking' },
] as const satisfies { id: WatchlistTab; label: string }[];

export function WatchlistPage() {
  const [activeTab, setActiveTab] = useState<WatchlistTab>('manage');
  // Owned here, not inside either scanner tab, so scan results survive switching sub-tabs and
  // are shared between Momentum and Pre-Squeeze — one scan populates both.
  const priceSignalsScan = usePriceSignalsScan();

  return (
    <div>
      <h2>Watchlist</h2>
      <TabStrip tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === 'manage' && <WatchlistManagementPage />}
      {activeTab === 'momentum' && <MomentumScanner scanState={priceSignalsScan} />}
      {activeTab === 'pre-squeeze' && <PreSqueezeScanner scanState={priceSignalsScan} />}
      {activeTab === 'dividend-ranking' && <DividendRanking />}
    </div>
  );
}

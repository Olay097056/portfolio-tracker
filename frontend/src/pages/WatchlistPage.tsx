// frontend/src/pages/WatchlistPage.tsx
import { useState } from 'react';
import { TabStrip } from '../components/TabStrip';
import { DividendRanking } from '../components/DividendRanking';
import { MomentumScanner } from '../components/MomentumScanner';
import { PreSqueezeScanner } from '../components/PreSqueezeScanner';
import { useDividendScan } from '../hooks/useDividendScan';
import { usePriceSignalsScan } from '../hooks/usePriceSignalsScan';
import { WatchlistManagementPage } from './WatchlistManagementPage';

type WatchlistTab = 'manage' | 'dividend-ranking' | 'momentum' | 'pre-squeeze';

// "Manage Watchlist", not "Watchlist" — the top-level nav button in App.tsx is already labelled
// "Watchlist"; a same-labelled sub-tab button would make getByRole('button', { name: 'Watchlist' })
// ambiguous in tests (both buttons render at once) and confusing for a screen-reader user.
const TABS = [
  { id: 'manage', label: 'Manage Watchlist' },
  { id: 'dividend-ranking', label: 'Dividend Ranking' },
  { id: 'momentum', label: 'Momentum Scanner' },
  { id: 'pre-squeeze', label: 'Pre-Squeeze Scanner' },
] as const satisfies { id: WatchlistTab; label: string }[];

export function WatchlistPage() {
  const [activeTab, setActiveTab] = useState<WatchlistTab>('manage');
  // Owned here, not inside any scanner tab, so scan results (and, for Dividend Ranking, the tax
  // rate) survive switching sub-tabs. priceSignalsScan is shared between Momentum and Pre-Squeeze
  // (one scan populates both); dividendScan is its own separate instance — dividends share
  // nothing with the price-signal scanners.
  const priceSignalsScan = usePriceSignalsScan();
  const dividendScan = useDividendScan();
  const [dividendTaxRatePct, setDividendTaxRatePct] = useState('15');

  return (
    <div>
      <h2>Watchlist</h2>
      <TabStrip tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === 'manage' && <WatchlistManagementPage />}
      {activeTab === 'dividend-ranking' && (
        <DividendRanking scanState={dividendScan} taxRatePct={dividendTaxRatePct} onTaxRatePctChange={setDividendTaxRatePct} />
      )}
      {activeTab === 'momentum' && <MomentumScanner scanState={priceSignalsScan} />}
      {activeTab === 'pre-squeeze' && <PreSqueezeScanner scanState={priceSignalsScan} />}
    </div>
  );
}

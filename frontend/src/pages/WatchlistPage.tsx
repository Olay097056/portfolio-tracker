// frontend/src/pages/WatchlistPage.tsx
import { useState } from 'react';
import { TabStrip } from '../components/TabStrip';
import { MomentumScanner } from '../components/MomentumScanner';
import { usePriceSignalsScan } from '../hooks/usePriceSignalsScan';
import { WatchlistManagementPage } from './WatchlistManagementPage';

type WatchlistTab = 'manage' | 'momentum';

// "Manage Watchlist", not "Watchlist" — the top-level nav button in App.tsx is already labelled
// "Watchlist"; a same-labelled sub-tab button would make getByRole('button', { name: 'Watchlist' })
// ambiguous in tests (both buttons render at once) and confusing for a screen-reader user.
const TABS = [
  { id: 'manage', label: 'Manage Watchlist' },
  { id: 'momentum', label: 'Momentum Scanner' },
] as const satisfies { id: WatchlistTab; label: string }[];

export function WatchlistPage() {
  const [activeTab, setActiveTab] = useState<WatchlistTab>('manage');
  // Owned here, not inside MomentumScanner, so the scan results survive switching sub-tabs —
  // and so Ticket 5's Pre-Squeeze tab can receive this same instance and reuse one scan's data.
  const priceSignalsScan = usePriceSignalsScan();

  return (
    <div>
      <h2>Watchlist</h2>
      <TabStrip tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === 'manage' && <WatchlistManagementPage />}
      {activeTab === 'momentum' && <MomentumScanner scanState={priceSignalsScan} />}
    </div>
  );
}

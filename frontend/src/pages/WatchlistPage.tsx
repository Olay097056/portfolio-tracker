import { useState } from 'react';
import { TabStrip } from '../components/TabStrip';
import { WatchlistManagementPage } from './WatchlistManagementPage';

type WatchlistTab = 'manage';

// "Manage Watchlist", not "Watchlist" — the top-level nav button in App.tsx is already labelled
// "Watchlist"; a same-labelled sub-tab button would make getByRole('button', { name: 'Watchlist' })
// ambiguous in tests (both buttons render at once) and confusing for a screen-reader user.
const TABS = [{ id: 'manage', label: 'Manage Watchlist' }] as const satisfies { id: WatchlistTab; label: string }[];

export function WatchlistPage() {
  const [activeTab, setActiveTab] = useState<WatchlistTab>('manage');

  return (
    <div>
      <h2>Watchlist</h2>
      <TabStrip tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === 'manage' && <WatchlistManagementPage />}
    </div>
  );
}

// frontend/src/components/WatchlistPanel.tsx
// wethaiinvest.com Widget 3: Watchlists & Custom Lists Tabs
// Inline tab-based watchlist panel on Dashboard. Click a ticker to select it on the chart.
import { useState } from 'react';
import type { WatchlistItem } from '../api/types';

interface WatchlistPanelProps {
  items: WatchlistItem[];
  selectedTicker: string | null;
  onSelectTicker: (ticker: string) => void;
  currentPrices?: Record<string, number>;
  currencyMultiplier?: number;
  currencySymbol?: string;
}

const TAB_CATEGORIES = ['ALL', 'รายการโปรด', 'ETF', 'DEFAULT'] as const;
type TabCategory = (typeof TAB_CATEGORIES)[number];

const ETF_TICKERS = new Set(['VTI', 'VOO', 'SPY', 'QQQ', 'IWM', 'GLD', 'TLT', 'SMH', 'SOXX', 'XLK', 'ARKK', 'VNQ', 'VEA', 'VWO', 'BND', 'AGG']);
const FAVORITES = new Set(['AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMZN', 'GOOGL', 'META', 'AMD']);

export function WatchlistPanel({
  items,
  selectedTicker,
  onSelectTicker,
  currentPrices = {},
  currencyMultiplier = 1,
  currencySymbol = '$',
}: WatchlistPanelProps) {
  const [activeTab, setActiveTab] = useState<TabCategory>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.ticker.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    switch (activeTab) {
      case 'รายการโปรด':
        return FAVORITES.has(item.ticker);
      case 'ETF':
        return ETF_TICKERS.has(item.ticker);
      case 'DEFAULT':
        return !ETF_TICKERS.has(item.ticker) && !FAVORITES.has(item.ticker);
      default:
        return true;
    }
  });

  return (
    <div style={{
      borderRadius: '12px',
      background: 'rgba(13, 19, 34, 0.9)',
      border: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      {/* Panel Header */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fcd34d' }}>⭐ Watchlist</span>
        <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>{items.length} tickers</span>
      </div>

      {/* Tab Buttons */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {TAB_CATEGORIES.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '7px 12px',
              fontSize: '0.78rem',
              whiteSpace: 'nowrap',
              borderRadius: 0,
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
              background: 'transparent',
              color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: activeTab === tab ? 700 : 500,
              cursor: 'pointer',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Search Input */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
        <input
          type="text"
          placeholder="ค้นหาชื่อหุ้น (TICKER)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
          style={{ width: '100%', padding: '6px 10px', fontSize: '0.8rem', boxSizing: 'border-box' }}
        />
      </div>

      {/* Ticker List */}
      <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
        {filteredItems.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {items.length === 0 ? 'ยังไม่มีหุ้นใน Watchlist' : 'ไม่พบหุ้นที่ค้นหา'}
          </div>
        ) : (
          filteredItems.map((item) => {
            const price = currentPrices[item.ticker];
            const isSelected = item.ticker === selectedTicker;
            return (
                <div
                  key={item.ticker}
                  ref={(el) => {
                    if (isSelected && el && typeof el.scrollIntoView === 'function') {
                      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    }
                  }}
                  onClick={() => onSelectTicker(item.ticker)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 14px',
                    cursor: 'pointer',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isSelected && <span style={{ fontSize: '0.6rem', color: 'var(--primary)' }}>▶</span>}
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: isSelected ? 'var(--primary)' : 'var(--text)', fontFamily: 'Outfit, sans-serif' }}>
                    {item.ticker}
                  </span>
                  {ETF_TICKERS.has(item.ticker) && (
                    <span style={{ fontSize: '0.6rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', fontWeight: 600 }}>ETF</span>
                  )}
                </div>
                {price !== undefined && (
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}>
                    {currencySymbol}{(price * currencyMultiplier).toFixed(2)}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

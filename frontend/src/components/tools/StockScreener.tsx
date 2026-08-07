// frontend/src/components/tools/StockScreener.tsx

import { useState, useMemo, useEffect, useCallback } from 'react';
import { SCREENER_STOCKS, type ScreenerStock } from '../../data/screenerStocks';
import {
  DEFAULT_FILTERS,
  PRESET_STRATEGIES,
  getActiveFilterCount,
  type FilterState,
  type ScreenerSortKey,
  type ScreenerSortOrder,
} from '../../utils/screenerFilters';

interface StockScreenerProps {
  currency?: 'USD' | 'THB';
  fxRate?: number;
}

interface ScreenerApiResponse {
  total: number;
  page: number;
  pageSize: number;
  stocks: ScreenerStock[];
  refreshedAt?: string | null;
}

export function StockScreener({ currency = 'USD', fxRate = 33.38 }: StockScreenerProps) {
  // Filter state & preset state
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // Accordion state
  const [isAccordionOpen, setIsAccordionOpen] = useState<boolean>(true);

  // Sorting state
  const [sortKey, setSortKey] = useState<ScreenerSortKey>('marketCap');
  const [sortOrder, setSortOrder] = useState<ScreenerSortOrder>('desc');

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 50;

  // Favorites & Compare state
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [compared, setCompared] = useState<Set<string>>(new Set());

  // API data state
  const [stocks, setStocks] = useState<ScreenerStock[]>([]);
  const [totalItems, setTotalItems] = useState<number>(0);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Extract unique sectors & subSectors dynamically from base stock dataset
  const availableSectors = useMemo(() => {
    const set = new Set<string>();
    SCREENER_STOCKS.forEach((s) => s.sector && set.add(s.sector));
    return Array.from(set).sort();
  }, []);

  const availableSubSectors = useMemo(() => {
    const set = new Set<string>();
    SCREENER_STOCKS.forEach((s) => s.subSector && set.add(s.subSector));
    return Array.from(set).sort();
  }, []);

  // Fetch stocks from backend API
  const fetchStocks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const baseUrl = import.meta.env?.VITE_API_BASE_URL ?? 'http://localhost:8000';
      const endpoint = import.meta.env?.VITE_API_BASE_URL
        ? `${baseUrl}/api/screener/stocks`
        : '/api/screener/stocks';

      const payload = {
        preset: activePreset || 'all',
        filters: filters,
        sort: {
          field: sortKey,
          order: sortOrder,
        },
        page: currentPage,
        pageSize: pageSize,
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Status ${response.status}`);
      }

      const data: ScreenerApiResponse = await response.json();
      setStocks(data.stocks || []);
      setTotalItems(data.total ?? 0);
      setRefreshedAt(data.refreshedAt || null);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch screener stocks');
    } finally {
      setLoading(false);
    }
  }, [activePreset, filters, sortKey, sortOrder, currentPage, pageSize]);

  useEffect(() => {
    fetchStocks();
  }, [fetchStocks]);

  // Handle Preset Select
  const handleSelectPreset = (presetId: string) => {
    if (activePreset === presetId) {
      setFilters(DEFAULT_FILTERS);
      setActivePreset(null);
    } else {
      const preset = PRESET_STRATEGIES[presetId];
      if (preset) {
        setFilters(preset.filters);
        setActivePreset(presetId);
      }
    }
    setCurrentPage(1);
  };

  // Handle Filter Change
  const handleFilterChange = (field: keyof FilterState, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [field]: value,
    }));
    setActivePreset(null);
    setCurrentPage(1);
  };

  // Search handler
  const handleSearchChange = (query: string) => {
    setFilters((prev) => ({ ...prev, searchQuery: query }));
    setCurrentPage(1);
  };

  // Reset Filters
  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setActivePreset(null);
    setCurrentPage(1);
  };

  // Favorite toggle
  const toggleFavorite = (symbol: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  };

  // Compare toggle
  const toggleCompare = (symbol: string) => {
    setCompared((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  };

  // Sorting header click handler
  const handleHeaderClick = (key: ScreenerSortKey) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  };

  const activeFilterCount = useMemo(() => {
    return getActiveFilterCount(filters);
  }, [filters]);

  // Server-side pagination metrics
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Format currency helpers
  const formatMarketCap = (capUsd: number) => {
    const val = currency === 'THB' ? capUsd * fxRate : capUsd;
    const prefix = currency === 'THB' ? '฿' : '$';

    if (val >= 1e12) return `${prefix}${(val / 1e12).toFixed(2)}T`;
    if (val >= 1e9) return `${prefix}${(val / 1e9).toFixed(2)}B`;
    if (val >= 1e6) return `${prefix}${(val / 1e6).toFixed(2)}M`;
    return `${prefix}${val.toLocaleString()}`;
  };

  const formatUpside = (upside: number) => {
    const isPositive = upside >= 0;
    const sign = isPositive ? '+' : '';
    const color = isPositive ? 'var(--green, #10b981)' : 'var(--red, #ef4444)';
    return (
      <span style={{ color, fontWeight: 700 }}>
        {sign}
        {upside.toFixed(2)}%
      </span>
    );
  };

  const formatRefreshedAt = (isoString?: string | null): string => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '';
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `อัปเดตล่าสุด: ${day}/${month} ${hours}:${minutes} น.`;
    } catch {
      return '';
    }
  };

  return (
    <div
      className="card glass-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        padding: '24px',
        color: '#f8fafc',
      }}
    >
      {/* ── Title Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: '1.5rem',
              fontWeight: 800,
              fontFamily: 'Outfit, sans-serif',
              color: '#f8fafc',
            }}
          >
            เครื่องมือคัดกรองหุ้น <span style={{ fontSize: '0.85em', opacity: 0.85 }}>(US Stock Screener)</span>
          </h3>
          <p style={{ margin: '6px 0 0 0', fontSize: '0.88rem', color: '#94a3b8' }}>
            ค้นหาโอกาสการลงทุนที่ดีที่สุดจากฐานข้อมูลล่าสุด
          </p>
        </div>
        {refreshedAt && (
          <div style={{ fontSize: '0.8rem', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)', padding: '4px 12px', borderRadius: '12px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
            {formatRefreshedAt(refreshedAt)}
          </div>
        )}
      </div>

      {/* ── 10 Preset Strategy Pills (Horizontal Scroll Row) ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          กลยุทธ์ยอดนิยม (PRESET STRATEGIES)
        </label>
        <div
          style={{
            display: 'flex',
            gap: '10px',
            overflowX: 'auto',
            paddingBottom: '8px',
            scrollbarWidth: 'thin',
          }}
        >
          {Object.values(PRESET_STRATEGIES)
            .slice(0, 10)
            .map((preset) => {
              const isSelected = activePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset.id)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '20px',
                    whiteSpace: 'nowrap',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    background: isSelected ? 'rgba(56, 189, 248, 0.25)' : 'rgba(30, 41, 59, 0.6)',
                    border: isSelected ? '1px solid var(--primary, #38bdf8)' : '1px solid rgba(255, 255, 255, 0.12)',
                    color: isSelected ? '#ffffff' : '#cbd5e1',
                    boxShadow: isSelected ? '0 0 12px rgba(56, 189, 248, 0.35)' : 'none',
                  }}
                >
                  {preset.name}
                </button>
              );
            })}
        </div>
      </div>

      {/* ── Collapsible Accordion Filter Controls ── */}
      <div
        style={{
          background: 'rgba(30, 41, 59, 0.5)',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          onClick={() => setIsAccordionOpen((prev) => !prev)}
          style={{
            width: '100%',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'transparent',
            border: 'none',
            color: '#f8fafc',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: 700,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>ตัวกรองหุ้นรายละเอียด</span>
            <span
              style={{
                background: activeFilterCount > 0 ? 'var(--primary, #38bdf8)' : 'rgba(255, 255, 255, 0.15)',
                color: activeFilterCount > 0 ? '#0f172a' : '#94a3b8',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: 800,
              }}
            >
              {activeFilterCount}
            </span>
          </div>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{isAccordionOpen ? '▲ ซ่อนตัวกรอง' : '▼ แสดงตัวกรอง'}</span>
        </button>

        {isAccordionOpen && (
          <div style={{ padding: '0 18px 18px 18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* 3-row Grid of 17 Dropdowns + 1 Sort Dropdown (Total 18 dropdowns) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
                gap: '12px',
              }}
            >
              {/* 1. Market Cap */}
              <div>
                <label htmlFor="filter-market-cap" style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                  มูลค่าตลาด
                </label>
                <select
                  id="filter-market-cap"
                  value={filters.marketCap}
                  onChange={(e) => handleFilterChange('marketCap', e.target.value)}
                  className="glass-input"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', borderRadius: '8px' }}
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="mega">Mega (&gt; $200B)</option>
                  <option value="large">Large ($10B - $200B)</option>
                  <option value="mid">Mid ($2B - $10B)</option>
                  <option value="small">Small (&lt; $2B)</option>
                </select>
              </div>

              {/* 2. Sector */}
              <div>
                <label htmlFor="filter-sector" style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                  กลุ่มอุตสาหกรรม
                </label>
                <select
                  id="filter-sector"
                  value={filters.sector}
                  onChange={(e) => handleFilterChange('sector', e.target.value)}
                  className="glass-input"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', borderRadius: '8px' }}
                >
                  <option value="all">ทั้งหมด</option>
                  {availableSectors.map((sec) => (
                    <option key={sec} value={sec}>
                      {sec}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. SubSector */}
              <div>
                <label htmlFor="filter-subsector" style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                  อุตสาหกรรมย่อย
                </label>
                <select
                  id="filter-subsector"
                  value={filters.subSector}
                  onChange={(e) => handleFilterChange('subSector', e.target.value)}
                  className="glass-input"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', borderRadius: '8px' }}
                >
                  <option value="all">ทั้งหมด</option>
                  {availableSubSectors.map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. Div Yield */}
              <div>
                <label htmlFor="filter-div-yield" style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                  อัตราตอบแทนปันผล
                </label>
                <select
                  id="filter-div-yield"
                  value={filters.divYield}
                  onChange={(e) => handleFilterChange('divYield', e.target.value)}
                  className="glass-input"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', borderRadius: '8px' }}
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="high">สูง (&gt; 4%)</option>
                  <option value="moderate">ปานกลาง (2% - 4%)</option>
                  <option value="low">ต่ำ (&lt; 2%)</option>
                  <option value="none">ไม่มีปันผล (0%)</option>
                </select>
              </div>

              {/* 5. PE */}
              <div>
                <label htmlFor="filter-pe" style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                  P/E Ratio
                </label>
                <select
                  id="filter-pe"
                  value={filters.pe}
                  onChange={(e) => handleFilterChange('pe', e.target.value)}
                  className="glass-input"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', borderRadius: '8px' }}
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="under_15">น้อยกว่า 15</option>
                  <option value="15_30">15 - 30</option>
                  <option value="30_50">30 - 50</option>
                  <option value="over_50">มากกว่า 50</option>
                  <option value="negative">ติดลบ (ไม่มีกำไร)</option>
                </select>
              </div>

              {/* 6. PEG */}
              <div>
                <label htmlFor="filter-peg" style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                  PEG Ratio
                </label>
                <select
                  id="filter-peg"
                  value={filters.peg}
                  onChange={(e) => handleFilterChange('peg', e.target.value)}
                  className="glass-input"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', borderRadius: '8px' }}
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="under_1">น้อยกว่า 1.0</option>
                  <option value="1_2">1.0 - 2.0</option>
                  <option value="over_2">มากกว่า 2.0</option>
                </select>
              </div>

              {/* 7. PS */}
              <div>
                <label htmlFor="filter-ps" style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                  P/S Ratio
                </label>
                <select
                  id="filter-ps"
                  value={filters.ps}
                  onChange={(e) => handleFilterChange('ps', e.target.value)}
                  className="glass-input"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', borderRadius: '8px' }}
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="under_3">น้อยกว่า 3</option>
                  <option value="3_10">3 - 10</option>
                  <option value="over_10">มากกว่า 10</option>
                </select>
              </div>

              {/* 8. PB */}
              <div>
                <label htmlFor="filter-pb" style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                  P/B Ratio
                </label>
                <select
                  id="filter-pb"
                  value={filters.pb}
                  onChange={(e) => handleFilterChange('pb', e.target.value)}
                  className="glass-input"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', borderRadius: '8px' }}
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="under_1">น้อยกว่า 1.0</option>
                  <option value="1_3">1.0 - 3.0</option>
                  <option value="over_3">มากกว่า 3.0</option>
                </select>
              </div>

              {/* 9. EV/Sales */}
              <div>
                <label htmlFor="filter-evsales" style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                  EV / Sales
                </label>
                <select
                  id="filter-evsales"
                  value={filters.evSales}
                  onChange={(e) => handleFilterChange('evSales', e.target.value)}
                  className="glass-input"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', borderRadius: '8px' }}
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="under_5">น้อยกว่า 5</option>
                  <option value="5_15">5 - 15</option>
                  <option value="over_15">มากกว่า 15</option>
                </select>
              </div>

              {/* 10. RSI */}
              <div>
                <label htmlFor="filter-rsi" style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                  RSI (14)
                </label>
                <select
                  id="filter-rsi"
                  value={filters.rsi}
                  onChange={(e) => handleFilterChange('rsi', e.target.value)}
                  className="glass-input"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', borderRadius: '8px' }}
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="oversold">Oversold (&lt; 35)</option>
                  <option value="neutral">ปกติ (35 - 65)</option>
                  <option value="overbought">Overbought (&gt; 65)</option>
                </select>
              </div>

              {/* 11. ROE */}
              <div>
                <label htmlFor="filter-roe" style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                  ROE (%)
                </label>
                <select
                  id="filter-roe"
                  value={filters.roe}
                  onChange={(e) => handleFilterChange('roe', e.target.value)}
                  className="glass-input"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', borderRadius: '8px' }}
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="over_20">มากกว่า 20%</option>
                  <option value="10_20">10% - 20%</option>
                  <option value="under_10">น้อยกว่า 10%</option>
                </select>
              </div>

              {/* 12. Profit Margin */}
              <div>
                <label htmlFor="filter-profit-margin" style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                  Profit Margin (%)
                </label>
                <select
                  id="filter-profit-margin"
                  value={filters.profitMargin}
                  onChange={(e) => handleFilterChange('profitMargin', e.target.value)}
                  className="glass-input"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', borderRadius: '8px' }}
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="over_20">มากกว่า 20%</option>
                  <option value="10_20">10% - 20%</option>
                  <option value="under_10">น้อยกว่า 10%</option>
                </select>
              </div>

              {/* 13. EPS */}
              <div>
                <label htmlFor="filter-eps" style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                  EPS ($)
                </label>
                <select
                  id="filter-eps"
                  value={filters.eps}
                  onChange={(e) => handleFilterChange('eps', e.target.value)}
                  className="glass-input"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', borderRadius: '8px' }}
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="positive">กำไรสุทธิ (&gt; 0)</option>
                  <option value="over_5">เติบโตสูง (&gt; $5)</option>
                  <option value="negative">ขาดทุน (&lt; 0)</option>
                </select>
              </div>

              {/* 14. D/E */}
              <div>
                <label htmlFor="filter-de" style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                  D/E Ratio
                </label>
                <select
                  id="filter-de"
                  value={filters.de}
                  onChange={(e) => handleFilterChange('de', e.target.value)}
                  className="glass-input"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', borderRadius: '8px' }}
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="under_1">หนี้ต่ำ (&lt; 1.0)</option>
                  <option value="1_2">1.0 - 2.0</option>
                  <option value="over_2">มากกว่า 2.0</option>
                </select>
              </div>

              {/* 15. Gross Margin */}
              <div>
                <label htmlFor="filter-gross-margin" style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                  Gross Margin (%)
                </label>
                <select
                  id="filter-gross-margin"
                  value={filters.grossMargin}
                  onChange={(e) => handleFilterChange('grossMargin', e.target.value)}
                  className="glass-input"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', borderRadius: '8px' }}
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="over_50">มากกว่า 50%</option>
                  <option value="30_50">30% - 50%</option>
                  <option value="under_30">น้อยกว่า 30%</option>
                </select>
              </div>

              {/* 16. P/FCF */}
              <div>
                <label htmlFor="filter-pfcf" style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                  P/FCF Ratio
                </label>
                <select
                  id="filter-pfcf"
                  value={filters.pFcf}
                  onChange={(e) => handleFilterChange('pFcf', e.target.value)}
                  className="glass-input"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', borderRadius: '8px' }}
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="under_20">น้อยกว่า 20</option>
                  <option value="20_40">20 - 40</option>
                  <option value="over_40">มากกว่า 40</option>
                </select>
              </div>

              {/* 17. ROIC */}
              <div>
                <label htmlFor="filter-roic" style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                  ROIC (%)
                </label>
                <select
                  id="filter-roic"
                  value={filters.roic}
                  onChange={(e) => handleFilterChange('roic', e.target.value)}
                  className="glass-input"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', borderRadius: '8px' }}
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="over_15">มากกว่า 15%</option>
                  <option value="5_15">5% - 15%</option>
                  <option value="under_5">น้อยกว่า 5%</option>
                </select>
              </div>

              {/* 18. Sort Dropdown */}
              <div>
                <label htmlFor="filter-sort-by" style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                  เรียงลำดับตาม
                </label>
                <select
                  id="filter-sort-by"
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as ScreenerSortKey)}
                  className="glass-input"
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', borderRadius: '8px' }}
                >
                  <option value="marketCap">มูลค่าตลาด (Market Cap)</option>
                  <option value="pe">P/E Ratio</option>
                  <option value="peg">PEG Ratio</option>
                  <option value="divYield">เงินปันผล (Div Yield)</option>
                  <option value="upside">Upside (%)</option>
                  <option value="symbol">ชื่อย่อหุ้น (Symbol)</option>
                  <option value="company">ชื่อบริษัท (Company)</option>
                </select>
              </div>
            </div>

            {/* Reset Button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button
                type="button"
                onClick={handleResetFilters}
                style={{
                  padding: '6px 16px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#cbd5e1',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
              >
                ล้างตัวกรองทั้งหมด
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Top-right Search Bar & Total count ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#cbd5e1' }}>
          แสดง {startItem} - {endItem} จาก {totalItems} หุ้น
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input
            id="screener-search-input"
            type="text"
            placeholder="ค้นหาชื่อหุ้น หรือ บริษัท"
            aria-label="ค้นหาชื่อหุ้น หรือ บริษัท"
            value={filters.searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="glass-input"
            style={{
              padding: '8px 14px',
              width: '260px',
              borderRadius: '10px',
              fontSize: '0.88rem',
            }}
          />
        </div>
      </div>

      {/* Error banner card */}
      {error && (
        <div
          style={{
            padding: '24px',
            borderRadius: '12px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#fca5a5',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>เกิดข้อผิดพลาดในการโหลดข้อมูล ({error})</div>
          <button
            type="button"
            onClick={fetchStocks}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              background: '#ef4444',
              color: '#ffffff',
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ลองอีกครั้ง
          </button>
        </div>
      )}

      {/* ── Results Table (9 columns) ── */}
      <div style={{ overflowX: 'auto' }}>
        <table className="zebra-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '850px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(15, 23, 42, 0.5)' }}>
              <th style={{ padding: '12px 14px', fontSize: '0.85rem', color: '#94a3b8' }}>
                <button
                  type="button"
                  onClick={() => handleHeaderClick('symbol')}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }}
                >
                  บริษัท {sortKey === 'symbol' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </button>
              </th>
              <th style={{ padding: '12px 14px', fontSize: '0.85rem', color: '#94a3b8' }}>
                <button
                  type="button"
                  onClick={() => handleHeaderClick('sector')}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }}
                >
                  กลุ่มอุตสาหกรรม {sortKey === 'sector' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </button>
              </th>
              <th style={{ padding: '12px 14px', fontSize: '0.85rem', color: '#94a3b8' }}>
                <button
                  type="button"
                  onClick={() => handleHeaderClick('subSector')}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }}
                >
                  อุตสาหกรรมย่อย {sortKey === 'subSector' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </button>
              </th>
              <th style={{ padding: '12px 14px', fontSize: '0.85rem', color: '#94a3b8', textAlign: 'right' }}>
                <button
                  type="button"
                  onClick={() => handleHeaderClick('marketCap')}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }}
                >
                  มูลค่าตลาด {sortKey === 'marketCap' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </button>
              </th>
              <th style={{ padding: '12px 14px', fontSize: '0.85rem', color: '#94a3b8', textAlign: 'right' }}>
                <button
                  type="button"
                  onClick={() => handleHeaderClick('pe')}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }}
                >
                  P/E {sortKey === 'pe' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </button>
              </th>
              <th style={{ padding: '12px 14px', fontSize: '0.85rem', color: '#94a3b8', textAlign: 'right' }}>
                <button
                  type="button"
                  onClick={() => handleHeaderClick('peg')}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }}
                >
                  PEG {sortKey === 'peg' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </button>
              </th>
              <th style={{ padding: '12px 14px', fontSize: '0.85rem', color: '#94a3b8', textAlign: 'right' }}>
                <button
                  type="button"
                  onClick={() => handleHeaderClick('upside')}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }}
                >
                  UPSIDE {sortKey === 'upside' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                </button>
              </th>
              <th style={{ padding: '12px 10px', fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center', width: '40px' }}>♥</th>
              <th style={{ padding: '12px 10px', fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center', width: '40px' }}>⊕</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, idx) => (
                <tr key={`skeleton-${idx}`} className="animate-pulse" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <td style={{ padding: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.1)' }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ width: '60px', height: '14px', background: 'rgba(255, 255, 255, 0.15)', borderRadius: '4px' }} />
                        <div style={{ width: '120px', height: '10px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px' }} />
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '14px' }}><div style={{ width: '80px', height: '12px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px' }} /></td>
                  <td style={{ padding: '14px' }}><div style={{ width: '90px', height: '12px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px' }} /></td>
                  <td style={{ padding: '14px' }}><div style={{ width: '70px', height: '12px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', marginLeft: 'auto' }} /></td>
                  <td style={{ padding: '14px' }}><div style={{ width: '40px', height: '12px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', marginLeft: 'auto' }} /></td>
                  <td style={{ padding: '14px' }}><div style={{ width: '40px', height: '12px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', marginLeft: 'auto' }} /></td>
                  <td style={{ padding: '14px' }}><div style={{ width: '50px', height: '12px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', marginLeft: 'auto' }} /></td>
                  <td style={{ padding: '14px', textAlign: 'center' }}><div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.1)', margin: '0 auto' }} /></td>
                  <td style={{ padding: '14px', textAlign: 'center' }}><div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.1)', margin: '0 auto' }} /></td>
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: '#fca5a5' }}>
                  เกิดข้อผิดพลาดในการดึงข้อมูล
                </td>
              </tr>
            ) : stocks.length > 0 ? (
              stocks.map((stock) => {
                const isFav = favorites.has(stock.symbol);
                const isComp = compared.has(stock.symbol);

                return (
                  <tr
                    key={stock.symbol}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    {/* บริษัท column */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '8px',
                            backgroundColor: stock.logoColor || '#38bdf8',
                            color: '#ffffff',
                            fontWeight: 800,
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)',
                          }}
                        >
                          {stock.logoInitials}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#f8fafc' }}>{stock.symbol}</span>
                          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{stock.company}</span>
                        </div>
                      </div>
                    </td>

                    {/* กลุ่มอุตสาหกรรม */}
                    <td style={{ padding: '12px 14px', fontSize: '0.85rem', color: '#cbd5e1' }}>{stock.sector}</td>

                    {/* อุตสาหกรรมย่อย */}
                    <td style={{ padding: '12px 14px', fontSize: '0.85rem', color: '#94a3b8' }}>{stock.subSector}</td>

                    {/* มูลค่าตลาด */}
                    <td style={{ padding: '12px 14px', fontSize: '0.88rem', fontWeight: 600, textAlign: 'right', color: '#f8fafc' }}>
                      {formatMarketCap(stock.marketCap)}
                    </td>

                    {/* P/E */}
                    <td style={{ padding: '12px 14px', fontSize: '0.88rem', textAlign: 'right', color: '#cbd5e1' }}>
                      {stock.pe !== null && stock.pe !== undefined ? stock.pe.toFixed(1) : '—'}
                    </td>

                    {/* PEG */}
                    <td style={{ padding: '12px 14px', fontSize: '0.88rem', textAlign: 'right', color: '#cbd5e1' }}>
                      {stock.peg !== null && stock.peg !== undefined ? stock.peg.toFixed(2) : '—'}
                    </td>

                    {/* UPSIDE */}
                    <td style={{ padding: '12px 14px', fontSize: '0.88rem', textAlign: 'right' }}>
                      {formatUpside(stock.upside)}
                    </td>

                    {/* ♥ Favorite toggle button */}
                    <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => toggleFavorite(stock.symbol)}
                        aria-label={`Favorite ${stock.symbol}`}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '1.1rem',
                          color: isFav ? '#ef4444' : '#64748b',
                          transition: 'transform 0.15s ease, color 0.15s ease',
                        }}
                      >
                        {isFav ? '♥' : '♡'}
                      </button>
                    </td>

                    {/* ⊕ Compare circle-plus button */}
                    <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => toggleCompare(stock.symbol)}
                        aria-label={`Compare ${stock.symbol}`}
                        style={{
                          background: isComp ? 'rgba(56, 189, 248, 0.2)' : 'none',
                          border: isComp ? '1px solid var(--primary, #38bdf8)' : 'none',
                          borderRadius: '50%',
                          width: '26px',
                          height: '26px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          fontSize: '1.1rem',
                          color: isComp ? '#38bdf8' : '#64748b',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        ⊕
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                  ไม่พบหุ้นที่ตรงกับเงื่อนไขการค้นหา
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination Footer Controls ── */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: currentPage === 1 ? '#475569' : '#f8fafc',
              cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
            }}
          >
            &lt;
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => {
            const isActive = pg === currentPage;
            return (
              <button
                key={pg}
                type="button"
                onClick={() => setCurrentPage(pg)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  background: isActive ? 'var(--primary, #38bdf8)' : 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: isActive ? '#0f172a' : '#f8fafc',
                  fontWeight: isActive ? 800 : 400,
                  cursor: 'pointer',
                }}
              >
                {pg}
              </button>
            );
          })}

          <button
            type="button"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: currentPage === totalPages ? '#475569' : '#f8fafc',
              cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
            }}
          >
            &gt;
          </button>
        </div>
      )}
    </div>
  );
}

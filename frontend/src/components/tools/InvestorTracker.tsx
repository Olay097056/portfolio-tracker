import { useEffect, useState } from 'react';
import { getInvestorProfile, getInvestorsStatus, listInvestors, listNewHoldings, refreshInvestorsApi } from '../../api/client';
import type { InvestorProfile, NewHoldingStock } from '../../api/types';
import { TickerAutocomplete } from '../TickerAutocomplete';

const NEW_HOLDINGS_PAGE_SIZE = 20;

interface InvestorTrackerProps {
  currency?: 'USD' | 'THB';
  fxRate?: number;
}

function formatAumUsd(usd: number): string {
  if (usd >= 1e12) return `$${(usd / 1e12).toFixed(1)}T`;
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(1)}M`;
  if (usd <= 0) return '$0';
  return `$${usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function mostCommon(values: string[]): string | null {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

// Shared pagination for the SEC-derived feed.
function buildPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 3) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, 2, 3, total, current]);
  if (current > 1) pages.add(current - 1);
  if (current < total) pages.add(current + 1);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const result: (number | '...')[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('...');
    result.push(sorted[i]);
  }
  return result;
}

export function InvestorTracker({ currency = 'USD', fxRate = 33.38 }: InvestorTrackerProps) {
  const [investors, setInvestors] = useState<InvestorProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortBy, setSortBy] = useState<'performance' | 'portfolio_value' | 'name'>('performance');
  const [activeSubTab, setActiveSubTab] = useState<'portfolios' | 'new-holdings'>('portfolios');
  const [displayLimit, setDisplayLimit] = useState<number>(50);

  // New Holdings feed: independent search and pagination, derived from SEC filing changes.
  const [newHoldings, setNewHoldings] = useState<NewHoldingStock[]>([]);
  const [nhLoading, setNhLoading] = useState<boolean>(false);
  const [nhSearch, setNhSearch] = useState<string>('');
  const [nhPage, setNhPage] = useState<number>(1);
  const [nhTotalItems, setNhTotalItems] = useState<number>(0);
  const [nhTotalPages, setNhTotalPages] = useState<number>(1);
  const [selectedStock, setSelectedStock] = useState<NewHoldingStock | null>(null);

  // Live Sync & Timestamp State
  const [lastFetchedAt, setLastFetchedAt] = useState<string>('');
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Detail Modal State
  const [selectedInvestorSlug, setSelectedInvestorSlug] = useState<string | null>(null);
  const [selectedInvestor, setSelectedInvestor] = useState<InvestorProfile | null>(null);
  const [modalLoading, setModalLoading] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    Promise.all([
      listInvestors(searchTerm, sortBy).catch(() => []),
      getInvestorsStatus().catch(() => null),
    ]).then(([invList, statusData]) => {
      if (!isMounted) return;
      setInvestors(invList);
      if (statusData?.last_fetched_at) {
        setLastFetchedAt(statusData.last_fetched_at);
      }
      setLoading(false);
    }).catch((err) => {
      if (!isMounted) return;
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [searchTerm, sortBy]);

  // New Holdings feed: separate effect keyed on its own page/search so switching the
  // Portfolios tab's search/sort doesn't re-fetch this, and vice versa.
  useEffect(() => {
    let isMounted = true;
    setNhLoading(true);
    listNewHoldings(nhPage, NEW_HOLDINGS_PAGE_SIZE, nhSearch || undefined)
      .then((data) => {
        if (!isMounted) return;
        setNewHoldings(data.items);
        setNhTotalItems(data.total_items);
        setNhTotalPages(data.total_pages);
      })
      .catch(() => {
        if (!isMounted) return;
        setNewHoldings([]);
      })
      .finally(() => {
        if (isMounted) setNhLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [nhPage, nhSearch]);

  // Open Investor Detail Modal
  function handleOpenInvestorModal(slug: string) {
    setSelectedInvestorSlug(slug);
    setModalLoading(true);
    getInvestorProfile(slug)
      .then((data) => {
        setSelectedInvestor(data);
      })
      .catch(() => {})
      .finally(() => {
        setModalLoading(false);
      });
  }

  // Force Refresh API Data
  function handleRefreshApi() {
    setRefreshing(true);
    refreshInvestorsApi()
      .then((status) => {
        setLastFetchedAt(status.last_fetched_at);
        return Promise.all([
          listInvestors(searchTerm, sortBy),
          listNewHoldings(1, NEW_HOLDINGS_PAGE_SIZE, nhSearch || undefined).catch(() => null),
        ]);
      })
      .then(([invList, nhData]) => {
        setInvestors(invList);
        if (nhData) {
          setNewHoldings(nhData.items);
          setNhTotalItems(nhData.total_items);
          setNhTotalPages(nhData.total_pages);
          setNhPage(1);
        }
      })
      .catch(() => {})
      .finally(() => {
        setRefreshing(false);
      });
  }

  // A single letter keeps the UI useful when SEC does not provide an image.
  function initialOf(name: string): string {
    return name.trim().charAt(0).toUpperCase() || '?';
  }

  const multiplier = currency === 'THB' ? fxRate : 1;
  const currencySymbol = currency === 'THB' ? '฿' : '$';

  // KPI aggregates
  const topPerformer = investors.length > 0
    ? [...investors].sort((a, b) => (b.performance_1y_pct ?? -Infinity) - (a.performance_1y_pct ?? -Infinity))[0]
    : null;
  const totalAumUsd = investors.reduce((sum, inv) => sum + (inv.portfolio_value_num || 0), 0);
  const totalAumFormatted = formatAumUsd(totalAumUsd);
  // Each investor's last_13f_filing is real, derived per-investor from their
  // own holdings — they don't all share one quarter, so the KPI card shows
  // whichever one is most common among the fetched investors, not a single
  // universal fact.
  const mostCommonFiling = mostCommon(investors.map((inv) => inv.last_13f_filing));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── Section Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--text)' }}>
              🕵️‍♂️ พอร์ตนักลงทุนระดับโลก (Super Investor Tracker)
            </h3>
            <span className="badge badge-blue" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>SEC EDGAR 13F</span>
            {lastFetchedAt && (
              <span className="badge badge-green" style={{ fontSize: '0.75rem', padding: '3px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                🕒 อัปเดตข้อมูล API ล่าสุด: <strong>{lastFetchedAt}</strong>
              </span>
            )}
          </div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            ติดตามการเคลื่อนไหว หุ้นถือครองสูงสุด และรายงาน 13F Filings ของเซียนหุ้นและเฮดจ์ฟันด์ระดับโลก
          </span>
        </div>

        {/* View Toggle & Sync Refresh Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleRefreshApi}
            disabled={refreshing}
            style={{
              padding: '6px 14px',
              fontSize: '0.82rem',
              borderRadius: '8px',
              border: '1px solid var(--green)',
              background: 'rgba(16, 185, 129, 0.15)',
              color: 'var(--green)',
              fontWeight: 700,
              cursor: refreshing ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            🔄 {refreshing ? 'กำลังดึง API สด...' : 'ดึงข้อมูลสด (Sync API)'}
          </button>

          <div style={{ display: 'inline-flex', background: 'rgba(15,23,42,0.85)', padding: '3px', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => setActiveSubTab('portfolios')}
              style={{
                padding: '6px 16px',
                fontSize: '0.82rem',
                borderRadius: '8px',
                border: 'none',
                background: activeSubTab === 'portfolios' ? 'var(--primary)' : 'transparent',
                color: activeSubTab === 'portfolios' ? '#fff' : 'var(--text-muted)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              📊 พอร์ตนักลงทุน (Portfolios)
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('new-holdings')}
              style={{
                padding: '6px 16px',
                fontSize: '0.82rem',
                borderRadius: '8px',
                border: 'none',
                background: activeSubTab === 'new-holdings' ? 'var(--green)' : 'transparent',
                color: activeSubTab === 'new-holdings' ? '#fff' : 'var(--text-muted)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              🆕 หุ้นเข้าใหม่ (New Holdings)
            </button>
          </div>
        </div>
      </div>

      {/* ── Portfolio summary: shared app theme ── */}
      {activeSubTab === 'portfolios' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <div className="card" style={{ margin: 0, padding: '14px 18px', background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>กองทุนเซียนหุ้นที่ติดตาม</span>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text)', marginTop: '4px' }}>
            {investors.length} กองทุนหลัก
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Top Super Investors</span>
        </div>

        <div className="card" style={{ margin: 0, padding: '14px 18px', background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>ผลตอบแทนสูงสุด 1 ปี</span>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--green)', marginTop: '4px' }}>
            {topPerformer?.performance_1y_pct != null ? `+${topPerformer.performance_1y_pct}%` : '—'}
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {topPerformer ? `${topPerformer.name} (${topPerformer.fund_name})` : '—'}
          </span>
        </div>

        <div className="card" style={{ margin: 0, padding: '14px 18px', background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>มูลค่าพอร์ตรวม (AUM)</span>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--yellow)', marginTop: '4px' }}>
            {totalAumFormatted}
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Combined Portfolio AUM</span>
        </div>

        <div className="card" style={{ margin: 0, padding: '14px 18px', background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>13F FILING ที่พบบ่อยที่สุด</span>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>
            {mostCommonFiling ? mostCommonFiling.replace(/SEC Form 13F \(?|\)$/g, '') : '—'}
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>รอบที่นักลงทุนส่วนใหญ่รายงานล่าสุด — แต่ละกองทุนอาจต่างกัน</span>
        </div>
      </div>
      )}

      {/* ── Search & Filter Control Bar ── */}
      {activeSubTab === 'portfolios' && (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <TickerAutocomplete
              placeholder="🔍 ค้นหานักลงทุน, ชื่อกองทุน หรือ Ticker หุ้น (เช่น Buffett, Cathie, AAPL)..."
              value={searchTerm}
              onChange={setSearchTerm}
              onSelect={(item) => setSearchTerm(item.symbol)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'rgba(15,23,42,0.8)',
                color: '#fff',
                fontSize: '0.88rem',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>เรียงลำดับ:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'rgba(15,23,42,0.8)',
                color: '#fff',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              <option value="performance">📈 ผลตอบแทน 1 ปี (Highest Return)</option>
              <option value="portfolio_value">💰 มูลค่าพอร์ต (AUM)</option>
              <option value="name">🔤 ชื่อนักลงทุน (Alphabetical)</option>
            </select>
          </div>
        </div>
      )}

      {error && <div role="alert" style={{ marginBottom: '12px' }}>{error}</div>}

      {activeSubTab === 'new-holdings' ? (
        /* ── New Holdings: SEC-derived changes ── */
        <div>
          <div className="nh-hero">
            <div className="nh-hero-inner">
              <span className="nh-hero-badge">🚀 สินทรัพย์ใหม่</span>
              <h1 className="nh-hero-title">หุ้นใหม่ในพอร์ตนักลงทุนระดับโลก</h1>
              <p className="nh-hero-subtitle">
                รวมหุ้นที่ถูกเพิ่มเข้าพอร์ตใหม่ (New holding)
                <br />
                กดที่หุ้นเพื่อดูว่าใครเข้าซื้อ สัดส่วนในพอร์ต และราคาเฉลี่ยที่ซื้อ
              </p>
            </div>
          </div>

          <div className="nh-search-wrap">
            <svg className="nh-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21 21-4.34-4.34" />
              <circle cx="11" cy="11" r="8" />
            </svg>
            <TickerAutocomplete
              className="nh-search-input"
              placeholder="ค้นหาชื่อหุ้น..."
              value={nhSearch}
              onChange={(v) => {
                setNhSearch(v);
                setNhPage(1);
              }}
              onSelect={(item) => {
                setNhSearch(item.symbol);
                setNhPage(1);
              }}
            />
          </div>

          {nhLoading ? (
            <div className="nh-empty">กำลังโหลดข้อมูลหุ้นเข้าใหม่…</div>
          ) : newHoldings.length === 0 ? (
            <div className="nh-empty">ไม่พบหุ้นที่ตรงกับคำค้นหา</div>
          ) : (
            <>
              <div className="nh-grid">
                {newHoldings.map((stock) => {
                  const visibleBuyers = stock.buyers.slice(0, 4);
                  const extraBuyers = stock.buyers_count - visibleBuyers.length;
                  return (
                    <div
                      key={stock.ticker + stock.company_name}
                      className="nh-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedStock(stock)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setSelectedStock(stock);
                      }}
                    >
                      <div className="nh-card-top">
                        <div className="nh-card-logo">
                          {stock.logo_url ? (
                            <img src={stock.logo_url} alt={stock.company_name} />
                          ) : (
                            <div className="nh-card-logo-fallback">{initialOf(stock.company_name)}</div>
                          )}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <h3 className="nh-card-name">{stock.company_name}</h3>
                          <p className="nh-card-price">
                            ราคาปัจจุบัน {stock.current_price != null ? `$${stock.current_price.toLocaleString()}` : 'N/A'}
                          </p>
                        </div>
                      </div>

                      <div className="nh-card-bottom">
                        <div className="nh-avatar-stack">
                          <div className="nh-avatar-stack-imgs">
                            {visibleBuyers.map((buyer, idx) => (
                              buyer.investor_avatar_url ? (
                                <img
                                  key={buyer.investor_slug}
                                  className="nh-avatar"
                                  src={buyer.investor_avatar_url}
                                  alt={buyer.investor_name}
                                  title={buyer.investor_name}
                                  style={{ zIndex: visibleBuyers.length - idx }}
                                />
                              ) : (
                                <div
                                  key={buyer.investor_slug}
                                  className="nh-avatar-fallback"
                                  title={buyer.investor_name}
                                  style={{ zIndex: visibleBuyers.length - idx }}
                                >
                                  {initialOf(buyer.investor_name)}
                                </div>
                              )
                            ))}
                          </div>
                          {extraBuyers > 0 && <span className="nh-avatar-more">+{extraBuyers}</span>}
                        </div>
                        <span className="nh-buyers-badge">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                            <path d="M16 3.128a4 4 0 0 1 0 7.744" />
                            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                            <circle cx="9" cy="7" r="4" />
                          </svg>
                          {stock.buyers_count} คนซื้อ
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="nh-pagination">
                <p className="nh-pagination-info">
                  แสดง <strong>{(nhPage - 1) * NEW_HOLDINGS_PAGE_SIZE + 1} - {Math.min(nhPage * NEW_HOLDINGS_PAGE_SIZE, nhTotalItems)}</strong> จาก <strong>{nhTotalItems}</strong> หุ้น
                </p>
                <div className="nh-pagination-btns">
                  <button
                    type="button"
                    className="nh-page-btn"
                    disabled={nhPage <= 1}
                    onClick={() => setNhPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
                  >
                    ‹
                  </button>
                  {buildPageNumbers(nhPage, nhTotalPages).map((p, idx) =>
                    p === '...' ? (
                      <span key={`ellipsis-${idx}`} className="nh-page-ellipsis">…</span>
                    ) : (
                      <button
                        key={p}
                        type="button"
                        className={`nh-page-btn${p === nhPage ? ' active' : ''}`}
                        onClick={() => setNhPage(p)}
                      >
                        {p}
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    className="nh-page-btn"
                    disabled={nhPage >= nhTotalPages}
                    onClick={() => setNhPage((p) => Math.min(nhTotalPages, p + 1))}
                    aria-label="Next page"
                  >
                    ›
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      ) : loading ? (
        <div className="card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading super investor tracker profiles…
        </div>
      ) : activeSubTab === 'portfolios' ? (
        /* ── Investor cards: shared app theme ── */
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {investors.slice(0, displayLimit).map((inv) => (
              <div
                key={inv.id}
                className="card"
                style={{
                  margin: 0,
                  padding: '20px',
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  {/* Profile Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
                    {inv.avatar_url ? (
                      <img src={inv.avatar_url} alt={inv.name} style={{ width: 54, height: 54, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--primary)' }} />
                    ) : (
                      <div aria-label={`${inv.name} initials`} style={{ width: 54, height: 54, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(59,130,246,0.18)', color: 'var(--primary)', border: '2px solid var(--primary)', fontWeight: 800, fontSize: '1.1rem' }}>
                        {initialOf(inv.name)}
                      </div>
                    )}
                    <div>
                      <h4 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)' }}>
                        {inv.name}
                      </h4>
                      <span style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600 }}>{inv.fund_name}</span>
                    </div>
                  </div>

                  {/* Metrics Badges */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', marginBottom: '14px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div>
                      <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>ผลตอบแทน (1 ปี)</span>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: inv.performance_1y_pct != null && inv.performance_1y_pct >= 0 ? 'var(--green)' : 'var(--text-muted)', marginTop: '2px' }}>
                        {inv.performance_1y_pct != null ? `${inv.performance_1y_pct >= 0 ? '+' : ''}${inv.performance_1y_pct}%` : '—'}
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>มูลค่าพอร์ต (AUM)</span>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text)', marginTop: '2px' }}>
                        {inv.portfolio_value_usd}
                      </div>
                    </div>
                  </div>

                  {/* Strategy Snippet */}
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.45', margin: '0 0 14px 0' }}>
                    {inv.description}
                  </p>

                  {/* Top Holdings Section */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--yellow)', textTransform: 'uppercase', marginBottom: '8px' }}>
                      🏆 สินทรัพย์ถือครองสูงสุด (Top Holdings)
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {inv.top_holdings.slice(0, 3).map((holding) => (
                        <div
                          key={holding.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.04)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 800, color: 'var(--primary)' }}>{holding.ticker || '—'}</span>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{holding.name}</span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)' }}>{holding.portfolio_percent != null ? `${holding.portfolio_percent}%` : '—'}</span>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{holding.activity_text}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* View Full Portfolio Button */}
                <button
                  type="button"
                  onClick={() => handleOpenInvestorModal(inv.slug)}
                  style={{
                    width: '100%',
                    padding: '9px',
                    borderRadius: '8px',
                    border: '1px solid var(--primary)',
                    background: 'rgba(56, 189, 248, 0.1)',
                    color: 'var(--primary)',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  🔍 ดูพอร์ตทั้งหมด & รายละเอียด 13F
                </button>
              </div>
            ))}
          </div>

          {/* Always Visible View Count Selector Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              marginTop: '28px',
              padding: '14px 20px',
              borderRadius: '12px',
              background: 'rgba(15,23,42,0.9)',
              border: '1px solid var(--border)',
            }}
          >
            <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              📊 กำลังแสดง <strong style={{ color: '#fff' }}>{Math.min(displayLimit, investors.length)}</strong> จากทั้งหมด <strong style={{ color: 'var(--yellow)' }}>{investors.length}</strong> กองทุนเซียนหุ้น
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>จำนวนการแสดงผล:</span>
              <button
                type="button"
                onClick={() => setDisplayLimit(12)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: displayLimit === 12 ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                  color: displayLimit === 12 ? '#fff' : 'var(--text-muted)',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                12 กองทุน
              </button>
              <button
                type="button"
                onClick={() => setDisplayLimit(24)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: displayLimit === 24 ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                  color: displayLimit === 24 ? '#fff' : 'var(--text-muted)',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                24 กองทุน
              </button>
              <button
                type="button"
                onClick={() => setDisplayLimit(999)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: displayLimit >= 50 ? 'var(--green)' : 'rgba(255,255,255,0.05)',
                  color: displayLimit >= 50 ? '#fff' : 'var(--text-muted)',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                🌐 แสดงทั้งหมด ({investors.length})
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Modal: Investor Detail Drawer / Modal ── */}
      {selectedInvestorSlug && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '650px', maxHeight: '85vh', overflowY: 'auto', background: 'var(--card-bg)', border: '1px solid var(--border)', padding: '24px', borderRadius: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#fff' }}>
                  {selectedInvestor?.name || 'Investor Details'}
                </h3>
                <span style={{ fontSize: '0.85rem', color: 'var(--primary)' }}>{selectedInvestor?.fund_name}</span>
              </div>
              <button type="button" onClick={() => setSelectedInvestorSlug(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.3rem', cursor: 'pointer' }}>✕</button>
            </div>

            {modalLoading ? (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0' }}>Loading profile details…</p>
            ) : selectedInvestor ? (
              <div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '16px' }}>
                  {selectedInvestor.description}
                </p>

                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--yellow)', marginBottom: '12px' }}>
                  📋 หุ้นทั้งหมดในพอร์ต (13F Holdings Breakdown)
                </h4>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', textTransform: 'uppercase', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        <th style={{ textAlign: 'left', padding: '8px' }}>หุ้น</th>
                        <th style={{ textAlign: 'right', padding: '8px' }}>สัดส่วน %</th>
                        <th style={{ textAlign: 'right', padding: '8px' }}>ราคาซื้อเฉลี่ย</th>
                        <th style={{ textAlign: 'right', padding: '8px' }}>ราคาล่าสุด</th>
                        <th style={{ textAlign: 'right', padding: '8px' }}>ผลตอบแทน</th>
                        <th style={{ textAlign: 'left', padding: '8px' }}>13F Activity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedInvestor.top_holdings.map((h) => (
                        <tr key={h.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '8px', fontWeight: 700, color: 'var(--primary)' }}>{h.ticker || '—'}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>{h.portfolio_percent != null ? `${h.portfolio_percent}%` : '—'}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text-muted)' }}>{h.avg_buy_price != null ? `${currencySymbol}${(h.avg_buy_price * multiplier).toFixed(2)}` : '—'}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>{h.current_price != null ? `${currencySymbol}${(h.current_price * multiplier).toFixed(2)}` : '—'}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: h.gain_percent != null && h.gain_percent >= 0 ? 'var(--green)' : 'var(--text-muted)' }}>
                            {h.gain_percent != null ? `${h.gain_percent >= 0 ? '+' : ''}${h.gain_percent}%` : '—'}
                          </td>
                          <td style={{ padding: '8px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>{h.activity_text}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button type="button" onClick={() => setSelectedInvestorSlug(null)} style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                    ปิด (Close)
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ── Modal: New Holding stock's buyer breakdown -- "กดที่หุ้นเพื่อดูว่าใครเข้าซื้อ
          สัดส่วนในพอร์ต และข้อมูลจาก SEC filing
          to stay visually consistent with the card grid it opens from. ── */}
      {selectedStock && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div className="card nh-modal-card" style={{ width: '100%', maxWidth: '650px', maxHeight: '85vh', overflowY: 'auto', padding: '24px', borderRadius: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="nh-card-logo" style={{ height: 44, width: 44 }}>
                  {selectedStock.logo_url ? (
                    <img src={selectedStock.logo_url} alt={selectedStock.company_name} />
                  ) : (
                    <div className="nh-card-logo-fallback">{initialOf(selectedStock.company_name)}</div>
                  )}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{selectedStock.company_name}</h3>
                  <span style={{ fontSize: '0.85rem', color: '#4f46e5', fontWeight: 700 }}>{selectedStock.ticker}</span>
                  {selectedStock.current_price != null && (
                    <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '10px' }}>${selectedStock.current_price.toLocaleString()}</span>
                  )}
                </div>
              </div>
              <button type="button" onClick={() => setSelectedStock(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.3rem', cursor: 'pointer' }}>✕</button>
            </div>

            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#4f46e5', marginBottom: '12px' }}>
              👥 นักลงทุนที่เข้าซื้อ ({selectedStock.buyers_count} ราย)
            </h4>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ textTransform: 'uppercase', fontSize: '0.72rem' }}>
                    <th style={{ textAlign: 'left', padding: '8px' }}>นักลงทุน</th>
                    <th style={{ textAlign: 'right', padding: '8px' }}>สัดส่วน %</th>
                    <th style={{ textAlign: 'right', padding: '8px' }}>ราคาซื้อเฉลี่ย</th>
                    <th style={{ textAlign: 'right', padding: '8px' }}>ผลตอบแทน</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedStock.buyers.map((buyer) => (
                    <tr key={buyer.investor_slug}>
                      <td style={{ padding: '8px', fontWeight: 700 }}>{buyer.investor_name}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#4f46e5' }}>{buyer.portfolio_percent}%</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: '#64748b' }}>
                        {buyer.avg_buy_price != null ? `$${buyer.avg_buy_price.toLocaleString()}` : 'ไม่มีข้อมูล'}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: buyer.gain_percent != null && buyer.gain_percent >= 0 ? '#16a34a' : '#dc2626' }}>
                        {buyer.gain_percent != null ? `${buyer.gain_percent >= 0 ? '+' : ''}${buyer.gain_percent}%` : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button type="button" onClick={() => setSelectedStock(null)} style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: '#4f46e5', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                ปิด (Close)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

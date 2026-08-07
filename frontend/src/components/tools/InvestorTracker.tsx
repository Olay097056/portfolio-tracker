import { useEffect, useState } from 'react';
import { getInvestorProfile, getInvestorsStatus, listInvestors, listNewHoldings, refreshInvestorsApi } from '../../api/client';
import type { InvestorProfile, NewHoldingActivity } from '../../api/types';

interface InvestorTrackerProps {
  currency?: 'USD' | 'THB';
  fxRate?: number;
}

export function InvestorTracker({ currency = 'USD', fxRate = 33.38 }: InvestorTrackerProps) {
  const [investors, setInvestors] = useState<InvestorProfile[]>([]);
  const [newHoldings, setNewHoldings] = useState<NewHoldingActivity[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortBy, setSortBy] = useState<'performance' | 'portfolio_value' | 'name'>('performance');
  const [activeSubTab, setActiveSubTab] = useState<'portfolios' | 'new-holdings'>('portfolios');
  const [displayLimit, setDisplayLimit] = useState<number>(50);

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
      listNewHoldings().catch(() => []),
      getInvestorsStatus().catch(() => null),
    ]).then(([invList, holdingsList, statusData]) => {
      if (!isMounted) return;
      setInvestors(invList);
      setNewHoldings(holdingsList);
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
        return listInvestors(searchTerm, sortBy);
      })
      .then((invList) => {
        setInvestors(invList);
      })
      .catch(() => {})
      .finally(() => {
        setRefreshing(false);
      });
  }

  const multiplier = currency === 'THB' ? fxRate : 1;
  const currencySymbol = currency === 'THB' ? '฿' : '$';

  // KPI aggregates
  const topPerformer = investors.length > 0
    ? [...investors].sort((a, b) => b.performance_1y_pct - a.performance_1y_pct)[0]
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── Section Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', fontFamily: 'Outfit, sans-serif' }}>
              🕵️‍♂️ พอร์ตนักลงทุนระดับโลก (Super Investor Tracker)
            </h3>
            <span className="badge badge-blue" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>konbalongtun style</span>
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
              border: '1px solid #10b981',
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#10b981',
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
                background: activeSubTab === 'new-holdings' ? '#10b981' : 'transparent',
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

      {/* ── Top Summary KPI Cards (Konbalongtun Style) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <div className="card" style={{ margin: 0, padding: '14px 18px', background: 'rgba(15, 23, 42, 0.85)', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>กองทุนเซียนหุ้นที่ติดตาม</span>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: '#f8fafc', marginTop: '4px' }}>
            {investors.length} กองทุนหลัก
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Top Super Investors</span>
        </div>

        <div className="card" style={{ margin: 0, padding: '14px 18px', background: 'rgba(15, 23, 42, 0.85)', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>ผลตอบแทนสูงสุด 1 ปี</span>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: '#10b981', marginTop: '4px' }}>
            +{topPerformer?.performance_1y_pct || 0}%
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {topPerformer ? `${topPerformer.name} (${topPerformer.fund_name})` : '—'}
          </span>
        </div>

        <div className="card" style={{ margin: 0, padding: '14px 18px', background: 'rgba(15, 23, 42, 0.85)', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>มูลค่าพอร์ตรวม (AUM)</span>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: '#fcd34d', marginTop: '4px' }}>
            $350.2B
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Combined Portfolio AUM</span>
        </div>

        <div className="card" style={{ margin: 0, padding: '14px 18px', background: 'rgba(15, 23, 42, 0.85)', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>รายงาน 13F FILING ล่าสุด</span>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: 'var(--primary)', marginTop: '4px' }}>
            Q1 2026
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>SEC Form 13F Quarter</span>
        </div>
      </div>

      {/* ── Search & Filter Control Bar ── */}
      {activeSubTab === 'portfolios' && (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <input
              type="text"
              placeholder="🔍 ค้นหานักลงทุน, ชื่อกองทุน หรือ Ticker หุ้น (เช่น Buffett, Cathie, AAPL)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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

      {loading ? (
        <div className="card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading super investor tracker profiles…
        </div>
      ) : activeSubTab === 'portfolios' ? (
        /* ── Investor Cards Grid (Konbalongtun Style) ── */
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {investors.slice(0, displayLimit).map((inv) => (
              <div
                key={inv.id}
                className="card"
                style={{
                  margin: 0,
                  padding: '20px',
                  background: 'rgba(15, 23, 42, 0.85)',
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
                    <img
                      src={inv.avatar_url}
                      alt={inv.name}
                      style={{
                        width: 54,
                        height: 54,
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '2px solid var(--primary)',
                      }}
                      onError={(e) => {
                        // Fallback avatar icon
                        e.currentTarget.src = 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';
                      }}
                    />
                    <div>
                      <h4 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc', fontFamily: 'Outfit, sans-serif' }}>
                        {inv.name}
                      </h4>
                      <span style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600 }}>{inv.fund_name}</span>
                    </div>
                  </div>

                  {/* Metrics Badges */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', marginBottom: '14px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div>
                      <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>ผลตอบแทน (1 ปี)</span>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: inv.performance_1y_pct >= 0 ? '#10b981' : 'var(--red)', marginTop: '2px' }}>
                        {inv.performance_1y_pct >= 0 ? '+' : ''}{inv.performance_1y_pct}%
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>มูลค่าพอร์ต (AUM)</span>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc', marginTop: '2px' }}>
                        ${inv.portfolio_value_usd}
                      </div>
                    </div>
                  </div>

                  {/* Strategy Snippet */}
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.45', margin: '0 0 14px 0' }}>
                    {inv.description}
                  </p>

                  {/* Top Holdings Section */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#fcd34d', textTransform: 'uppercase', marginBottom: '8px' }}>
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
                            <span style={{ fontWeight: 800, color: 'var(--primary)', fontFamily: 'Outfit, sans-serif' }}>{holding.ticker}</span>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{holding.name}</span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8' }}>{holding.portfolio_percent}%</span>
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
              📊 กำลังแสดง <strong style={{ color: '#fff' }}>{Math.min(displayLimit, investors.length)}</strong> จากทั้งหมด <strong style={{ color: '#fcd34d' }}>{investors.length}</strong> กองทุนเซียนหุ้น
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
                  background: displayLimit >= 50 ? '#10b981' : 'rgba(255,255,255,0.05)',
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
      ) : (
        /* ── New Holdings Feed Section ── */
        <div className="card" style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid var(--border)' }}>
          <h4 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>
            🆕 หุ้นเข้าใหม่และรายการเคลื่อนไหวล่าสุด (13F Filing Feed)
          </h4>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textTransform: 'uppercase', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  <th style={{ textAlign: 'left', padding: '10px' }}>นักลงทุน</th>
                  <th style={{ textAlign: 'center', padding: '10px' }}>การเคลื่อนไหว</th>
                  <th style={{ textAlign: 'left', padding: '10px' }}>หุ้น (Ticker)</th>
                  <th style={{ textAlign: 'right', padding: '10px' }}>สัดส่วนในพอร์ต</th>
                  <th style={{ textAlign: 'right', padding: '10px' }}>ไตรมาส / วันที่</th>
                </tr>
              </thead>
              <tbody>
                {newHoldings.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px', fontWeight: 700, color: '#f8fafc' }}>{item.investor_name}</td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <span
                        className={`badge ${
                          item.action_type === 'BUY_NEW'
                            ? 'badge-green'
                            : item.action_type === 'INCREASE'
                            ? 'badge-blue'
                            : 'badge-red'
                        }`}
                        style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                      >
                        {item.action_label}
                      </span>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span style={{ fontWeight: 800, color: 'var(--primary)', fontFamily: 'Outfit, sans-serif' }}>{item.ticker}</span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: '6px' }}>{item.company_name}</span>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: '#fcd34d' }}>
                      {item.portfolio_percent}%
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', color: 'var(--text-muted)' }}>
                      {item.quarter} ({item.filing_date})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal: Investor Detail Drawer / Modal ── */}
      {selectedInvestorSlug && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '650px', maxHeight: '85vh', overflowY: 'auto', background: '#0f172a', border: '1px solid var(--border)', padding: '24px', borderRadius: '14px' }}>
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

                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#fcd34d', marginBottom: '12px' }}>
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
                          <td style={{ padding: '8px', fontWeight: 700, color: 'var(--primary)' }}>{h.ticker}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#38bdf8' }}>{h.portfolio_percent}%</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text-muted)' }}>{currencySymbol}{(h.avg_buy_price * multiplier).toFixed(2)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>{currencySymbol}{(h.current_price * multiplier).toFixed(2)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: h.gain_percent >= 0 ? '#10b981' : 'var(--red)' }}>
                            {h.gain_percent >= 0 ? '+' : ''}{h.gain_percent}%
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
    </div>
  );
}

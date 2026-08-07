// frontend/src/pages/DashboardPage.tsx
import { useEffect, useState } from 'react';
import { getUsdToThbRate, getNextEarnings } from '../api/client';
import type { ChartRange, NextEarnings, Zone } from '../api/types';
import { DcaCalculator } from '../components/DcaCalculator';
import { PositionWidget } from '../components/PositionWidget';
import { PriceChart } from '../components/PriceChart';
import { StressTestCalculator } from '../components/StressTestCalculator';
import { WatchlistPanel } from '../components/WatchlistPanel';
import { ZoneList } from '../components/ZoneList';
import { chartIdentityKey, useChartData } from '../hooks/useChartData';
import { useDashboardTickers } from '../hooks/useDashboardTickers';
import { usePortfolios } from '../hooks/usePortfolios';
import { useWatchlist } from '../hooks/useWatchlist';
import { useZoneEditing } from '../hooks/useZoneEditing';
import { useAiTechnicalSignal } from '../hooks/useAiTechnicalSignal';
import { useAiNarrative } from '../hooks/useAiNarrative';
import { usePatternHistory } from '../hooks/usePatternHistory';
import { AiAnalystPanel } from '../components/AiAnalystPanel';
import { PatternHistoryPanel } from '../components/PatternHistoryPanel';
import { PositionSizingCalculator } from '../components/PositionSizingCalculator';
import { computeDynamicSrMatrix } from '../utils/dynamicSrMatrix';
import { formatNumber } from '../utils/signalFormatting';
import { ZONE_STYLE } from '../utils/zoneStyle';

const RANGES: { value: ChartRange; label: string }[] = [
  { value: '1D', label: '1 day' },
  { value: '5D', label: '5 days' },
  { value: '1M', label: '1 month' },
  { value: '6M', label: '6 months' },
  { value: 'YTD', label: 'YTD' },
  { value: '1Y', label: '1 year' },
  { value: '5Y', label: '5 years' },
];

const POPULAR_SHORTCUTS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'VTI', 'SPY', 'SMH'];

function formatSigned(value: number, decimals = 2): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}`;
}

export function DashboardPage() {
  const { tickers, loading: tickersLoading, error: tickersError } = useDashboardTickers();
  const { portfolios } = usePortfolios();
  const { items: watchlistItems } = useWatchlist();

  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState('');
  const [range, setRange] = useState<ChartRange>('1Y');

  // Chart Overlay Controls (wethaiinvest.com toolbar style)
  const [showBollinger, setShowBollinger] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [lockZones, setLockZones] = useState(false);

  // Widget collapse state
  const [showPositionWidget, setShowPositionWidget] = useState(true);
  const [showDcaWidget, setShowDcaWidget] = useState(false);
  const [showStressTestWidget, setShowStressTestWidget] = useState(false);
  const [showSrMatrix, setShowSrMatrix] = useState(true);

  // FX Currency Toggle State
  const [currency, setCurrency] = useState<'USD' | 'THB'>('USD');
  const [fxRate, setFxRate] = useState<number>(33.38);

  useEffect(() => {
    getUsdToThbRate()
      .then((rate) => { if (rate) setFxRate(rate); })
      .catch(() => {});
  }, []);

  const { points, loading, error, zones, refetch } = useChartData(selectedTicker, range);
  const zoneEditing = useZoneEditing(selectedTicker, range, zones, refetch);
  const aiSignal = useAiTechnicalSignal(selectedTicker, points, zones);
  const aiNarrative = useAiNarrative();
  const patternHistory = usePatternHistory();
  useEffect(() => {
    aiNarrative.reset();
    patternHistory.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the ticker changes, not on every hook identity change
  }, [selectedTicker]);
  // Pattern history (ticket 06) fires once the AI narrative call resolves, using its
  // conflicting_signals to know whether "has_conflict" should be true for this lookup — the
  // narrative call is what actually determines whether a conflict is active for this view.
  useEffect(() => {
    if (aiNarrative.state.status === 'success' && selectedTicker) {
      const hasConflict = !!aiNarrative.state.result.conflicting_signals?.length;
      patternHistory.fetch(selectedTicker, aiSignal.type, hasConflict);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the narrative result itself changes
  }, [aiNarrative.state]);
  const analyzeWithAi = () => selectedTicker && aiNarrative.analyze(selectedTicker, aiSignal.metrics);

  // Earnings-date awareness — wayfinder ticket 03 (ai-signal-investor-upgrades map). A purely
  // technical read can get blown up by an earnings surprise; warn when one's coming up soon.
  const [nextEarnings, setNextEarnings] = useState<NextEarnings | null>(null);
  useEffect(() => {
    if (!selectedTicker) {
      setNextEarnings(null);
      return;
    }
    let cancelled = false;
    getNextEarnings(selectedTicker)
      .then((result) => { if (!cancelled) setNextEarnings(result); })
      .catch(() => { if (!cancelled) setNextEarnings(null); }); // no earnings data is a normal, silent case (ETFs etc.) -- see ticket 03
    return () => { cancelled = true; };
  }, [selectedTicker]);
  const EARNINGS_WARNING_WINDOW_DAYS = 14; // recommended default from ticket 03 -- roughly two weeks, close enough to matter for an ATR-based setup measured in days
  const upcomingEarningsDays =
    nextEarnings?.days_until !== null && nextEarnings?.days_until !== undefined && nextEarnings.days_until >= 0 && nextEarnings.days_until <= EARNINGS_WARNING_WINDOW_DAYS
      ? nextEarnings.days_until
      : null;

  const [dragPreview, setDragPreview] = useState<{ zone: Zone; price: number } | null>(null);
  const displayZones = dragPreview === null ? zones : zones.map((z) => (z === dragPreview.zone ? { ...z, price: dragPreview.price } : z));

  const currentPriceRaw = points !== null && points.length > 0 ? points[points.length - 1].close : null;
  const previousCloseRaw = points !== null && points.length > 1 ? points[points.length - 2].close : null;

  const multiplier = currency === 'THB' ? fxRate : 1;
  const currencySymbol = currency === 'THB' ? '฿' : '$';

  const currentPrice = currentPriceRaw !== null ? currentPriceRaw * multiplier : null;
  const previousClose = previousCloseRaw !== null ? previousCloseRaw * multiplier : null;

  const priceChange = currentPrice !== null && previousClose !== null ? currentPrice - previousClose : null;
  const priceChangePercent =
    priceChange !== null && previousClose !== null && previousClose !== 0 ? (priceChange / previousClose) * 100 : null;

  function handleAddZone(kind: 'support' | 'resistance' | 'freestyle') {
    if (currentPriceRaw === null) return;
    void zoneEditing.addZone(kind, currentPriceRaw);
  }

  function handleRecomputeDefaults() {
    if (!window.confirm('This will discard every zone you have placed for this ticker and range. Continue?')) return;
    void zoneEditing.recomputeDefaults();
  }

  function handleCustomSearch(e: React.FormEvent) {
    e.preventDefault();
    const clean = customInput.trim().toUpperCase();
    if (clean) setSelectedTicker(clean);
  }

  function handleSelectTicker(t: string) {
    setSelectedTicker(t);
    setCustomInput('');
  }

  const shortcutTickers = Array.from(new Set([...POPULAR_SHORTCUTS, ...tickers])).slice(0, 8);
  const totalCashUsd = portfolios.reduce((acc, p) => acc + (p.cash_usd || 0), 0);

  // Dynamic S/R Matrix — calculated from active zones or live chart high/low/close pivot points
  const srMatrix = computeDynamicSrMatrix(currentPriceRaw, points, zones);

  return (
    <div>
      {/* ── Header Row ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
          <h2>Dashboard</h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>ลงทุนหุ้นอเมริกา (wethaiinvest v1.9.13)</span>
        </div>

        {/* Currency Switcher Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'inline-flex', background: 'rgba(15,23,42,0.8)', padding: '3px', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <button type="button" onClick={() => setCurrency('USD')} style={{ padding: '5px 14px', fontSize: '0.8rem', borderRadius: '8px', border: 'none', background: currency === 'USD' ? 'var(--primary)' : 'transparent', color: currency === 'USD' ? '#fff' : 'var(--text-muted)', fontWeight: 600 }}>
              USD ($)
            </button>
            <button type="button" onClick={() => setCurrency('THB')} style={{ padding: '5px 14px', fontSize: '0.8rem', borderRadius: '8px', border: 'none', background: currency === 'THB' ? '#fcd34d' : 'transparent', color: currency === 'THB' ? '#000' : 'var(--text-muted)', fontWeight: 600 }}>
              THB (฿)
            </button>
          </div>
          <span className="badge badge-blue" style={{ fontSize: '0.75rem', padding: '5px 10px' }}>
            1 USD = {fxRate.toFixed(2)} THB
          </span>
        </div>
      </div>

      {/* ── Widget 1: Portfolio Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div className="card" style={{ margin: 0, padding: '16px 20px', background: 'rgba(17,24,39,0.8)' }}>
          <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>พอร์ตหุ้นทั้งหมด</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: '#f8fafc', marginTop: '4px' }}>
            {portfolios.length} Portfolio{portfolios.length !== 1 ? 's' : ''}
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cash: {currencySymbol}{(totalCashUsd * multiplier).toFixed(2)}</span>
        </div>

        <div className="card" style={{ margin: 0, padding: '16px 20px', background: 'rgba(17,24,39,0.8)' }}>
          <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Watchlist Universe</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: '#fcd34d', marginTop: '4px' }}>
            {watchlistItems.length} Tickers
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Tracked for Scanners</span>
        </div>

        <div className="card" style={{ margin: 0, padding: '16px 20px', background: 'rgba(17,24,39,0.8)' }}>
          <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Selected Ticker</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: 'var(--primary)', marginTop: '4px' }}>
            {selectedTicker ?? 'None'}
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{selectedTicker ? `Displaying ${currency} analytics` : 'Pick a ticker below'}</span>
        </div>
      </div>

      {tickersError ? (
        <div role="alert">{tickersError}</div>
      ) : tickersLoading ? (
        <div className="card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading tickers…</div>
      ) : (
        /* ── Two-column layout: Main chart area + Watchlist sidebar ── */
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px', alignItems: 'start' }}>

          {/* ── LEFT: Main chart panel ── */}
          <div>
            <div className="card">
              {/* Ticker selector row */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end', marginBottom: '16px' }}>
                {tickers.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '200px' }}>
                    <label htmlFor="dashboard-ticker" style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Ticker</label>
                    <select
                      id="dashboard-ticker"
                      value={selectedTicker ?? ''}
                      onChange={(e) => { setSelectedTicker(e.target.value || null); setCustomInput(''); }}
                      style={{ padding: '10px 14px', fontSize: '0.95rem' }}
                    >
                      <option value="">Select a ticker…</option>
                      {tickers.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}

                <form onSubmit={handleCustomSearch} style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexGrow: 1, maxWidth: '360px' }}>
                  <label htmlFor="search-stock-input" style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Search Any Stock / ETF Symbol</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      id="search-stock-input"
                      type="text"
                      placeholder="e.g. AAPL, NVDA, SMH..."
                      value={customInput}
                      onChange={(e) => setCustomInput(e.target.value)}
                      style={{ flexGrow: 1, padding: '10px 14px', textTransform: 'uppercase' }}
                    />
                    <button type="submit" style={{ padding: '10px 18px', background: 'linear-gradient(135deg,#38bdf8 0%,#0284c7 100%)', color: '#fff', border: 'none', fontWeight: 600 }}>Search</button>
                  </div>
                </form>
              </div>

              {/* Quick Ticker Pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingTop: '8px', borderTop: '1px solid var(--border)', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600 }}>Quick:</span>
                {shortcutTickers.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleSelectTicker(t)}
                    style={{ padding: '4px 12px', fontSize: '0.8rem', borderRadius: '20px', background: selectedTicker === t ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.04)', borderColor: selectedTicker === t ? 'var(--primary)' : 'rgba(255,255,255,0.1)', color: selectedTicker === t ? 'var(--primary)' : 'var(--text)' }}
                  >{t}</button>
                ))}
              </div>

              {tickers.length === 0 && !selectedTicker && (
                <p style={{ margin: '12px 0 0', color: 'var(--text-muted)' }}>No tickers to chart yet — add a holding or a Watchlist ticker first.</p>
              )}
            </div>

            {selectedTicker && (
              <>
                {/* ── Price Header Banner ── */}
                <div style={{ marginTop: '16px', padding: '16px 20px', background: 'rgba(15,23,42,0.85)', borderRadius: '12px 12px 0 0', border: '1px solid var(--border)', borderBottom: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>{selectedTicker} ({currency})</span>
                      <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>Live</span>
                    </div>

                    {priceChange !== null && priceChangePercent !== null ? (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                        <span style={{ fontSize: '2.2rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}>
                          {formatNumber(currentPrice)}
                          {currency === 'THB' && ' ฿'}
                        </span>
                        <span style={{ color: priceChange >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700, fontSize: '1rem', background: priceChange >= 0 ? 'var(--green-glow)' : 'var(--red-glow)', padding: '4px 10px', borderRadius: '6px' }}>
                          {formatSigned(priceChange)} ({formatSigned(priceChangePercent)}%)
                        </span>
                      </div>
                    ) : currentPrice !== null ? (
                      <span style={{ fontSize: '2.2rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif', display: 'block' }}>
                        {formatNumber(currentPrice)}{currency === 'THB' && ' ฿'}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>Loading live price…</span>
                    )}
                  </div>

                  {/* Range selector */}
                  <div role="group" aria-label="Range" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {RANGES.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        aria-pressed={r.value === range}
                        onClick={() => setRange(r.value)}
                        style={{ padding: '5px 12px', fontSize: '0.8rem', ...(r.value === range ? { borderColor: 'var(--primary)', color: 'var(--primary)', background: 'rgba(56,189,248,0.15)' } : {}) }}
                      >{r.label}</button>
                    ))}
                  </div>
                </div>

                {/* ── wethaiinvest Chart Toolbar ── */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: 'rgba(10,14,25,0.95)', border: '1px solid var(--border)', borderTop: 'none', borderBottom: 'none', flexWrap: 'wrap', gap: '10px', fontSize: '0.82rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer', color: 'var(--text-muted)' }}>
                      <input type="checkbox" checked={showBollinger} onChange={(e) => setShowBollinger(e.target.checked)} />
                      <span>Bollinger Bands</span>
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer', color: 'var(--text-muted)' }}>
                      <input type="checkbox" checked={showVolume} onChange={(e) => setShowVolume(e.target.checked)} />
                      <span>Volume</span>
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer', color: 'var(--text-muted)' }}>
                      <input type="checkbox" checked={lockZones} onChange={(e) => setLockZones(e.target.checked)} />
                      <span>🔓 ล๊อคเส้นแนวรับ-ต้าน</span>
                    </label>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'rgba(100,200,255,0.5)' }}>แท่งเทียน (Candlestick)</span>
                </div>

                {/* ── Candlestick Chart ── */}
                <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 12px 12px', overflow: 'hidden', background: '#0d1322' }}>
                  <PriceChart
                    key={chartIdentityKey(selectedTicker, range)}
                    points={points}
                    loading={loading}
                    error={error}
                    zones={zones}
                    showBollinger={showBollinger}
                    showVolume={showVolume}
                    onZoneDragMove={(zone, price) => setDragPreview({ zone, price })}
                    onZoneDragEnd={(zone, price) => {
                      setDragPreview(null);
                      void zoneEditing.dragZonePrice(zone, price);
                    }}
                    disabled={zoneEditing.busy || lockZones}
                  />
                </div>

                {zoneEditing.error && <div role="alert" style={{ marginTop: '8px' }}>{zoneEditing.error}</div>}

                {/* ── Dynamic AI Technical Signal Box ── */}
                <div
                  className="glass-panel card"
                  style={{
                    padding: '20px',
                    marginTop: '16px',
                    border: `1px solid ${aiSignal.badgeColor}44`,
                    boxShadow: `0 8px 32px -4px ${aiSignal.badgeColor}25`,
                    marginBottom: 0,
                  }}
                >
                  {/* Header & Confidence Rating Badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '1.4rem' }}>🤖</span>
                      <strong style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc', fontFamily: 'Outfit, sans-serif' }}>
                        AI Technical Signal ({selectedTicker})
                      </strong>
                    </div>
                    <span
                      className="badge"
                      style={{
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '0.82rem',
                        fontWeight: 800,
                        color: aiSignal.badgeColor,
                        background: aiSignal.badgeBg,
                        border: `1px solid ${aiSignal.badgeColor}66`,
                        letterSpacing: '0.04em',
                        boxShadow: `0 0 12px ${aiSignal.badgeColor}33`,
                      }}
                    >
                      {aiSignal.confidenceRating || aiSignal.badgeLabel}
                    </span>
                  </div>

                  {/* System score (left) + AI Analyst (right), side-by-side — wayfinder ticket 05
                      chose this layout ("Variant B") after a 3-variant /prototype comparison, on
                      the grounds that spatial parallelism communicates "two independent views"
                      better than stacking or a tab toggle. See ticket 05's Answer for the other
                      two variants considered. */}
                  <div className="ai-signal-split">
                  <div>

                  {/* Confidence Score Bar (0-100%) */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', fontSize: '0.8rem' }}>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Confidence Score</span>
                      <span style={{ color: aiSignal.badgeColor, fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}>
                        {aiSignal.confidenceScore}%
                      </span>
                    </div>
                    <div className="progress-track" style={{ height: '8px', background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div
                        className="progress-fill"
                        style={{
                          width: `${Math.min(100, Math.max(0, aiSignal.confidenceScore))}%`,
                          background: `linear-gradient(90deg, #38bdf8 0%, ${aiSignal.badgeColor} 100%)`,
                          boxShadow: `0 0 10px ${aiSignal.badgeColor}66`,
                        }}
                      />
                    </div>
                    {/* Accuracy disclosure — wayfinder ticket 02 (investor-upgrades map). Numbers
                        from backend/app/backtest/results/model_fit_report.md (ticket 08's
                        walk-forward classification result): avg accuracy 62.7% vs. avg
                        majority-class baseline 58.5%, beat baseline in 4/5 folds, AUC 0.60-0.78.
                        Always visible, not a tooltip — the whole point is it shouldn't be missable. */}
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.4 }}>
                      แม่นยำในอดีตประมาณ 62-63% (ดีกว่าการเดาแบบหยาบที่ ~58-59% เล็กน้อย, วัดจาก backtest 5 ปี) — ไม่ใช่การรับประกันผลในอนาคต
                    </div>
                  </div>

                  {/* Trading Setup Cards Grid (4 responsive cards) */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                      gap: '12px',
                      marginBottom: '16px',
                    }}
                  >
                    {/* Card 1: Entry Zone */}
                    <div className="glass-stat-card">
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>🎯</span> Entry Zone
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#38bdf8', fontFamily: 'Outfit, sans-serif' }}>
                        {aiSignal.tradingSetup.entryZone.min === 0 && aiSignal.tradingSetup.entryZone.max === 0
                          ? '-'
                          : aiSignal.tradingSetup.entryZone.min === aiSignal.tradingSetup.entryZone.max
                          ? `${currencySymbol}${formatNumber(aiSignal.tradingSetup.entryZone.min * multiplier)}`
                          : `${currencySymbol}${formatNumber(aiSignal.tradingSetup.entryZone.min * multiplier)} - ${currencySymbol}${formatNumber(aiSignal.tradingSetup.entryZone.max * multiplier)}`
                        }
                      </div>
                    </div>

                    {/* Card 2: Target Price TP */}
                    <div className="glass-stat-card">
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>🎯</span> Target Price TP
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#34d399', fontFamily: 'Outfit, sans-serif' }}>
                        {aiSignal.tradingSetup.targetPrice.price === 0
                          ? '-'
                          : `${currencySymbol}${formatNumber(aiSignal.tradingSetup.targetPrice.price * multiplier)}`
                        }
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600, marginTop: '2px' }}>
                        {aiSignal.tradingSetup.targetPrice.price === 0
                          ? ''
                          : `+${aiSignal.tradingSetup.targetPrice.upsidePct.toFixed(2)}% upside`
                        }
                      </div>
                    </div>

                    {/* Card 3: Stop Loss SL */}
                    <div className="glass-stat-card">
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>🛑</span> Stop Loss SL
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fb7185', fontFamily: 'Outfit, sans-serif' }}>
                        {aiSignal.tradingSetup.stopLoss.price === 0
                          ? '-'
                          : `${currencySymbol}${formatNumber(aiSignal.tradingSetup.stopLoss.price * multiplier)}`
                        }
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#f43f5e', fontWeight: 600, marginTop: '2px' }}>
                        {aiSignal.tradingSetup.stopLoss.price === 0
                          ? ''
                          : `${aiSignal.tradingSetup.stopLoss.downsidePct.toFixed(2)}% downside`
                        }
                      </div>
                    </div>

                    {/* Card 4: Risk-Reward Ratio R:R */}
                    <div className="glass-stat-card">
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>⚖️</span> Risk-Reward R:R
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fcd34d', fontFamily: 'Outfit, sans-serif' }}>
                        {aiSignal.tradingSetup.riskRewardRatio.formatted || `1 : ${aiSignal.tradingSetup.riskRewardRatio.ratio.toFixed(2)}`}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: '2px' }}>
                        Profit / Risk
                      </div>
                    </div>
                  </div>

                  {/* Position Sizing — wayfinder ticket 05 (ai-signal-investor-upgrades map) */}
                  <PositionSizingCalculator
                    portfolios={portfolios}
                    tradingSetup={aiSignal.tradingSetup}
                    currencySymbol={currencySymbol}
                    multiplier={multiplier}
                    formatNumber={formatNumber}
                  />

                  {/* Narrative Thai Text */}
                  <p style={{ margin: '0 0 16px 0', fontSize: '0.88rem', color: '#e2e8f0', lineHeight: '1.6', background: 'rgba(15,23,42,0.4)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    {aiSignal.narrative}
                  </p>

                  </div>

                  <AiAnalystPanel state={aiNarrative.state} onAnalyze={analyzeWithAi} disabled={!selectedTicker} />
                  <PatternHistoryPanel state={patternHistory.state} />

                  </div>{/* closes .ai-signal-split */}

                  {/* Live Technical Indicator Chips Bar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '0.78rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Live Indicators:</span>

                    {/* Earnings-date warning chip — wayfinder ticket 03 (ai-signal-investor-upgrades map) */}
                    {upcomingEarningsDays !== null && (
                      <span className="badge badge-amber" title={`วันประกาศงบ: ${nextEarnings?.next_earnings_date}`}>
                        📅 ประกาศงบใน {upcomingEarningsDays} วัน — ระวังความผันผวน
                      </span>
                    )}

                    {/* MA Crossover / Alignment Chip */}
                    {aiSignal.metrics.movingAverages && (
                      <>
                        {aiSignal.metrics.movingAverages.maCrossState === 'GOLDEN_CROSS' && (
                          <span className="badge badge-emerald">
                            ⚡ Golden Cross
                          </span>
                        )}
                        {aiSignal.metrics.movingAverages.maCrossState === 'DEATH_CROSS' && (
                          <span className="badge badge-red">
                            💀 Death Cross
                          </span>
                        )}
                        {aiSignal.metrics.movingAverages.isBullishAlignment && aiSignal.metrics.movingAverages.maCrossState !== 'GOLDEN_CROSS' && (
                          <span className="badge badge-green">
                            📈 Bullish Alignment
                          </span>
                        )}
                      </>
                    )}

                    {/* MACD Chip */}
                    {aiSignal.metrics.macd && (
                      <span className={`badge ${aiSignal.metrics.macd.crossover === 'BULLISH' ? 'badge-emerald' : aiSignal.metrics.macd.crossover === 'BEARISH' ? 'badge-red' : 'badge-cyan'}`}>
                        MACD: {aiSignal.metrics.macd.crossover === 'BULLISH' ? 'Bullish Cross 🟢' : aiSignal.metrics.macd.crossover === 'BEARISH' ? 'Bearish Cross 🔴' : aiSignal.metrics.macd.macdLine !== null ? `${aiSignal.metrics.macd.macdLine.toFixed(2)}` : 'N/A'}
                      </span>
                    )}

                    {/* RSI 14 Chip */}
                    {aiSignal.metrics.rsi14 !== null && (
                      <span className="badge badge-yellow">
                        RSI 14: <strong>{aiSignal.metrics.rsi14}</strong>
                      </span>
                    )}

                    {/* BB Squeeze & Width Chip */}
                    {aiSignal.metrics.bbWidthPct !== null && (
                      <span className={`badge ${aiSignal.metrics.isSqueeze ? 'badge-purple' : 'badge-blue'}`}>
                        BB Width: <strong>{aiSignal.metrics.bbWidthPct}%</strong> {aiSignal.metrics.isSqueeze && '⚡ Squeeze'}
                      </span>
                    )}

                    {/* SMA 50 Distance Chip */}
                    {aiSignal.metrics.distanceFromSma50Pct !== null && (
                      <span className={`badge ${aiSignal.metrics.distanceFromSma50Pct >= 0 ? 'badge-green' : 'badge-red'}`}>
                        SMA 50: <strong>{aiSignal.metrics.distanceFromSma50Pct >= 0 ? '+' : ''}{aiSignal.metrics.distanceFromSma50Pct}%</strong>
                      </span>
                    )}

                    {/* Volume Ratio Chip */}
                    {aiSignal.metrics.volumeRatio !== null && (
                      <span className={`badge ${aiSignal.metrics.volumeRatio >= 1.4 ? 'badge-cyan' : 'badge-blue'}`}>
                        Vol Ratio: <strong>{aiSignal.metrics.volumeRatio}x</strong>
                      </span>
                    )}

                    {/* Nearest Resistance Chip */}
                    {aiSignal.metrics.nearestResistance && (
                      <span className="badge badge-amber">
                        Nearest R: <strong>{aiSignal.metrics.nearestResistance.label}</strong> ({currencySymbol}{formatNumber(aiSignal.metrics.nearestResistance.price * multiplier)})
                      </span>
                    )}

                    {/* Nearest Support Chip */}
                    {aiSignal.metrics.nearestSupport && (
                      <span className="badge badge-green">
                        Nearest S: <strong>{aiSignal.metrics.nearestSupport.label}</strong> ({currencySymbol}{formatNumber(aiSignal.metrics.nearestSupport.price * multiplier)})
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Zone Controls Bar ── */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginTop: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>Add Zone:</span>
                    <button type="button" onClick={() => handleAddZone('support')} disabled={zoneEditing.busy || lockZones} style={{ borderColor: ZONE_STYLE.support.color, color: ZONE_STYLE.support.color, padding: '5px 14px' }}>S</button>
                    <button type="button" onClick={() => handleAddZone('resistance')} disabled={zoneEditing.busy || lockZones} style={{ borderColor: ZONE_STYLE.resistance.color, color: ZONE_STYLE.resistance.color, padding: '5px 14px' }}>R</button>
                    <button type="button" onClick={() => handleAddZone('freestyle')} disabled={zoneEditing.busy || lockZones} style={{ borderColor: ZONE_STYLE.freestyle.color, color: ZONE_STYLE.freestyle.color, padding: '5px 14px' }}>Freestyle</button>

                    <button type="button" onClick={() => setShowPositionWidget(!showPositionWidget)} style={{ marginLeft: '8px', borderColor: '#38bdf8', color: '#7dd3fc', fontSize: '0.8rem' }}>
                      {showPositionWidget ? 'ซ่อนพอร์ต' : '💼 จัดการพอร์ต'}
                    </button>
                    <button type="button" onClick={() => setShowSrMatrix(!showSrMatrix)} style={{ borderColor: 'var(--primary)', color: '#93c5fd', fontSize: '0.8rem' }}>
                      {showSrMatrix ? 'ซ่อน S/R Matrix' : '📐 S/R Matrix'}
                    </button>
                    <button type="button" onClick={() => setShowDcaWidget(!showDcaWidget)} style={{ borderColor: '#6366f1', color: '#c7d2fe', fontSize: '0.8rem' }}>
                      {showDcaWidget ? 'ซ่อน DCA' : '🧮 คำนวณค่าเฉลี่ย (DCA)'}
                    </button>
                    <button type="button" onClick={() => setShowStressTestWidget(!showStressTestWidget)} style={{ borderColor: '#f59e0b', color: '#fde047', fontSize: '0.8rem' }}>
                      {showStressTestWidget ? 'ซ่อน Risk Sim' : '🛡️ คำนวณความเสียหาย'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {zoneEditing.busy && <span aria-live="polite" style={{ fontSize: '0.82rem', color: 'var(--primary)' }}>Working…</span>}
                    <button type="button" onClick={handleRecomputeDefaults} disabled={zoneEditing.busy || lockZones} style={{ borderColor: 'var(--red)', color: 'var(--red)', fontSize: '0.8rem' }}>Recompute defaults</button>
                  </div>
                </div>

                {/* ── Widget 5: จัดการพอร์ต (Position Widget) ── */}
                {showPositionWidget && (
                  <div style={{ marginTop: '16px' }}>
                    <PositionWidget ticker={selectedTicker} currencyMultiplier={multiplier} currencySymbol={currencySymbol} />
                  </div>
                )}

                {/* ── Widget 7: ตารางคำนวณ แนวรับ-แนวต้าน (S/R Matrix) ── */}
                {showSrMatrix && currentPriceRaw !== null && (
                  <div className="card" style={{ marginTop: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <h4 style={{ margin: 0, color: 'var(--primary)' }}>📐 ตารางคำนวณ แนวรับ-แนวต้าน — {selectedTicker}</h4>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>ราคาปัจจุบัน {currencySymbol}{formatNumber(currentPrice)}</span>
                    </div>
                    <table className="zebra-table">
                      <thead>
                        <tr>
                          <th>ระดับ (Level)</th>
                          <th>ระยะห่าง (Percent)</th>
                          <th>ราคา ({currency})</th>
                          <th>กลยุทธ์ (Action)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {srMatrix.map((item) => (
                          <tr key={item.label} style={{ background: item.kind === 'current' ? 'rgba(56,189,248,0.12)' : undefined }}>
                            <td style={{ fontWeight: 600, color: item.kind === 'resistance' ? '#f59e0b' : item.kind === 'support' ? '#10b981' : 'var(--primary)' }}>{item.label}</td>
                            <td style={{ color: item.pct > 0 ? '#10b981' : item.pct < 0 ? '#f43f5e' : 'var(--text-muted)', fontWeight: 600 }}>
                              {item.pct > 0 ? `+${item.pct.toFixed(2)}` : item.pct.toFixed(2)}%
                            </td>
                            <td style={{ fontWeight: 700 }}>{currencySymbol}{(item.price * multiplier).toFixed(2)}</td>
                            <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              {item.kind === 'resistance' ? '🎯 จุดทยอยขายทำกำไร' : item.kind === 'support' ? '🛒 จุดทยอยตั้งรับซื้อย่อตัว' : '📍 ราคาปัจจุบัน'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* ── Widget 6: คำนวณค่าเฉลี่ยล่วงหน้า (DCA Calculator) ── */}
                {showDcaWidget && currentPriceRaw !== null && (
                  <div style={{ marginTop: '16px', padding: '20px', borderRadius: '12px', background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(99,102,241,0.3)' }}>
                    <DcaCalculator currentShares={0} currentAvgCostUsd={currentPriceRaw} currentPriceUsd={currentPriceRaw} />
                  </div>
                )}

                {/* ── Widget 8: คำนวณความเสียหายล่วงหน้า (Risk Stress Test) ── */}
                {showStressTestWidget && currentPriceRaw !== null && (
                  <div style={{ marginTop: '16px', padding: '20px', borderRadius: '12px', background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(245,158,11,0.3)' }}>
                    <StressTestCalculator currentPriceUsd={currentPriceRaw} />
                  </div>
                )}

                {/* ── Zone List Table ── */}
                <div className="card" style={{ marginTop: '16px' }}>
                  <ZoneList zones={displayZones} onEditPrice={zoneEditing.editZonePrice} onDelete={zoneEditing.removeZone} disabled={zoneEditing.busy || lockZones} />
                </div>
              </>
            )}
          </div>

          {/* ── RIGHT: Watchlist Sidebar Panel (Widget 3) ── */}
          <div>
            <WatchlistPanel
              items={watchlistItems}
              selectedTicker={selectedTicker}
              onSelectTicker={handleSelectTicker}
              currencyMultiplier={multiplier}
              currencySymbol={currencySymbol}
              currentPrices={selectedTicker && currentPriceRaw !== null ? { [selectedTicker]: currentPriceRaw } : undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
}

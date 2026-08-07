import { useEffect, useMemo, useState } from 'react';
import {
  calculateDcaProjectionApi,
  getDcaAvailableTickers,
  getMarketData,
  type DcaCalculateResponse,
  type DcaTickerItem,
} from '../api/client';
import { calculateDcaProjectionFull, type DcaFullProjectionResult } from '../utils/dcaProjection';

export interface DcaProjectionCalculatorProps {
  currency?: 'THB' | 'USD';
  fxRate?: number;
}

const QUICK_PILLS = ['NVDA', 'AAPL', 'MSFT', 'VOO', 'SCHD', 'JEPQ'];

// Below this many years of real price history, the annualized growth rate is real but
// warned-about as unreliable for long-term planning. Chosen from a real case: QQQI (listed
// 2024-01-30) has ~2.5 years of history and a genuine but market-period-driven ~20%/yr CAGR.
const SHORT_HISTORY_THRESHOLD_YEARS = 3;

function safeFormat(val: number | null | undefined, maxDecimals = 0): string {
  if (val == null || isNaN(val)) return '0';
  return val.toLocaleString('en-US', { maximumFractionDigits: maxDecimals });
}

// `?? fallback` does NOT catch NaN (only null/undefined) -- a NaN from the API (e.g. a
// division by zero somewhere in the backend calculation) would sail through `x ?? fallback`
// unchanged and then render as the literal string "NaN". Route every apiResult-sourced
// number through this instead of a bare `??`.
function numOr(val: number | null | undefined, fallback: number): number {
  return typeof val === 'number' && Number.isFinite(val) ? val : fallback;
}

function formatCompact(amount: number | null | undefined, symbol: string): string {
  if (amount == null || isNaN(amount)) return `${symbol}0`;
  if (amount >= 1_000_000) {
    return `${symbol}${(amount / 1_000_000).toFixed(2)}M`;
  }
  if (amount >= 100_000) {
    return `${symbol}${(amount / 1_000).toFixed(0)}K`;
  }
  return `${symbol}${safeFormat(amount, 0)}`;
}

export function DcaProjectionCalculator({ currency = 'USD', fxRate = 33.38 }: DcaProjectionCalculatorProps) {
  const [activeCurrency, setActiveCurrency] = useState<'THB' | 'USD'>(currency);
  const [ticker, setTicker] = useState('');
  const [initialInvestment, setInitialInvestment] = useState(currency === 'THB' ? '100000' : '3000');
  const [monthlyContribution, setMonthlyContribution] = useState(currency === 'THB' ? '5000' : '150');
  const [years, setYears] = useState('10');
  const [dividendYieldPct, setDividendYieldPct] = useState('');
  const [priceGrowthRatePct, setPriceGrowthRatePct] = useState('');
  const [taxRatePct, setTaxRatePct] = useState('15');
  const [reinvestDividends, setReinvestDividends] = useState(true);

  // Tracks whether each value currently in the box came from a real backend fetch (dropdown
  // pick or ticker auto-fill) or was typed in by hand -- so the UI can show a "from backend"
  // badge only when it's actually true, and drop it the moment the user edits the field
  // themselves (their typed number is no longer backend data).
  const [dividendYieldSource, setDividendYieldSource] = useState<'backend' | 'manual' | null>(null);
  const [priceGrowthSource, setPriceGrowthSource] = useState<'backend' | 'manual' | null>(null);

  // Years of real price history the auto-filled growth rate was actually computed over (only
  // known for the manually-typed-ticker path, which is the one backed by real per-ticker
  // history — the dropdown's presets don't carry this). A short window means the number is
  // real but less reliable as a long-term rate; see SHORT_HISTORY_THRESHOLD_YEARS below.
  const [growthYearsUsed, setGrowthYearsUsed] = useState<number | null>(null);

  const [availableTickers, setAvailableTickers] = useState<DcaTickerItem[]>([]);
  const [apiResult, setApiResult] = useState<DcaCalculateResponse | null>(null);

  const symbol = activeCurrency === 'THB' ? '฿' : '$';

  // Slider bounds based on currency
  const maxInitial = activeCurrency === 'THB' ? 5000000 : 150000;
  const stepInitial = activeCurrency === 'THB' ? 10000 : 500;
  const maxMonthly = activeCurrency === 'THB' ? 200000 : 6000;
  const stepMonthly = activeCurrency === 'THB' ? 1000 : 50;

  // Synchronize currency prop changes
  useEffect(() => {
    setActiveCurrency(currency);
    if (currency === 'THB') {
      setInitialInvestment('100000');
      setMonthlyContribution('5000');
    } else {
      setInitialInvestment('3000');
      setMonthlyContribution('150');
    }
  }, [currency]);

  // Fetch available tickers on mount
  useEffect(() => {
    getDcaAvailableTickers()
      .then((tickers) => {
        if (Array.isArray(tickers)) setAvailableTickers(tickers);
      })
      .catch(() => {});
  }, []);

  // Fetch stock yield & growth on ticker update
  useEffect(() => {
    const trimmed = ticker.trim().toUpperCase();
    if (!trimmed) return;

    let cancelled = false;
    const timeoutId = setTimeout(() => {
      getMarketData([trimmed])
        .then((data) => {
          if (cancelled) return;
          const entry = data[trimmed];
          if (entry?.dividend_yield_pct != null) {
            setDividendYieldPct(String(entry.dividend_yield_pct.toFixed(2)));
            setDividendYieldSource('backend');
          } else {
            setDividendYieldPct('');
            setDividendYieldSource(null);
          }
          if (entry?.growth_rate_pct != null) {
            setPriceGrowthRatePct(String(entry.growth_rate_pct.toFixed(2)));
            setPriceGrowthSource('backend');
            setGrowthYearsUsed(entry.growth_rate_years_used ?? null);
          } else {
            setPriceGrowthRatePct('');
            setPriceGrowthSource(null);
            setGrowthYearsUsed(null);
          }
        })
        .catch(() => {
          if (cancelled) return;
          setDividendYieldPct('');
          setPriceGrowthRatePct('');
          setDividendYieldSource(null);
          setPriceGrowthSource(null);
          setGrowthYearsUsed(null);
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [ticker]);

  const numInitial = Number(initialInvestment) || 0;
  const numMonthly = Number(monthlyContribution) || 0;
  const numYears = Math.max(1, Math.min(30, Number(years) || 10));
  const numYield = Number(dividendYieldPct) || 0;
  const numGrowth = Number(priceGrowthRatePct) || 0;
  const numTax = Number(taxRatePct) || 15;

  // Client-side projection fallback
  const clientProjection = useMemo<DcaFullProjectionResult>(() => {
    return calculateDcaProjectionFull({
      initialInvestmentThb: numInitial,
      monthlyContributionThb: numMonthly,
      years: numYears,
      dividendYieldPct: numYield,
      priceGrowthRatePct: numGrowth,
      reinvestDividends,
      taxRatePct: numTax,
    });
  }, [numInitial, numMonthly, numYears, numYield, numGrowth, reinvestDividends, numTax]);

  // Attempt backend API calculation with fallback
  useEffect(() => {
    let active = true;
    calculateDcaProjectionApi({
      initial_amount: numInitial,
      monthly_dca: numMonthly,
      duration_years: numYears,
      div_yield_pct: numYield,
      growth_pct: numGrowth,
      tax_rate_pct: numTax,
      reinvest_dividends: reinvestDividends,
      currency: activeCurrency,
    })
      .then((res) => {
        if (active && res) setApiResult(res);
      })
      .catch(() => {
        if (active) setApiResult(null);
      });

    return () => {
      active = false;
    };
  }, [numInitial, numMonthly, numYears, numYield, numGrowth, numTax, reinvestDividends, activeCurrency]);

  const finalPortfolioValue = numOr(apiResult?.final_portfolio_value, clientProjection.finalPortfolioValue);
  const multiplier = numOr(apiResult?.multiplier, clientProjection.multiplier);
  const totalInvested = numOr(apiResult?.total_invested, clientProjection.totalInvested);
  const accumulatedDividend = numOr(apiResult?.accumulated_dividend, clientProjection.accumulatedDividend);
  const capitalGain = numOr(apiResult?.capital_gain, clientProjection.capitalGain);
  const totalReturn = numOr(apiResult?.total_return, clientProjection.totalReturn);
  const taxAmount = numOr(apiResult?.tax_amount, clientProjection.taxAmount);
  const finalMonthlyDividend = numOr(apiResult?.final_monthly_dividend, clientProjection.finalMonthlyDividend);
  const finalMonthlyGrowth = numOr(apiResult?.final_monthly_growth, clientProjection.finalMonthlyGrowth);
  const finalMonthlyTotal = numOr(apiResult?.final_monthly_total, clientProjection.finalMonthlyTotal);
  // Arrays aren't NaN-able themselves (an empty/missing array is null/undefined, not NaN), so
  // `??` is the right operator here -- individual NaN entries inside are guarded where rendered.
  const chartData = apiResult?.chart_data ?? clientProjection.chartData;
  const yearlyMilestones = apiResult?.yearly_milestones ?? clientProjection.yearlyMilestones;
  const yearlyBreakdown = clientProjection.yearlyBreakdown;

  const handleCurrencyToggle = (newCurr: 'THB' | 'USD') => {
    if (newCurr === activeCurrency) return;
    setActiveCurrency(newCurr);
    if (newCurr === 'THB') {
      const initVal = Math.round(numInitial * fxRate);
      const monthlyVal = Math.round(numMonthly * fxRate);
      setInitialInvestment(String(initVal > 0 ? initVal : 100000));
      setMonthlyContribution(String(monthlyVal > 0 ? monthlyVal : 5000));
    } else {
      const initVal = Math.round(numInitial / fxRate);
      const monthlyVal = Math.round(numMonthly / fxRate);
      setInitialInvestment(String(initVal > 0 ? initVal : 3000));
      setMonthlyContribution(String(monthlyVal > 0 ? monthlyVal : 150));
    }
  };

  const handleSelectTicker = (selectedSymbol: string) => {
    setTicker(selectedSymbol);
    // The dropdown's presets don't carry years-of-history -- cleared here, then correctly
    // repopulated shortly by the ticker-fetch effect below (which also runs on this same
    // symbol and does know years_used).
    setGrowthYearsUsed(null);
    const found = availableTickers.find((t) => t.symbol === selectedSymbol);
    if (found) {
      // Real yfinance-fetched values can be null (fetch failed for this ticker) -- leave the
      // field as-is rather than writing "null"/crashing on .toFixed() of a non-number.
      if (found.default_yield != null) {
        setDividendYieldPct(String(found.default_yield.toFixed(2)));
        setDividendYieldSource('backend');
      }
      if (found.default_growth != null) {
        setPriceGrowthRatePct(String(found.default_growth.toFixed(2)));
        setPriceGrowthSource('backend');
      }
    }
  };

  // Milestone filtering for milestone cards
  const filteredMilestones = useMemo(() => {
    if (!yearlyMilestones || yearlyMilestones.length === 0) return [];
    if (yearlyMilestones.length <= 10) return yearlyMilestones;
    const targetYearsSet = new Set([1, 2, 3, 5, 7, 10, 15, 20, 25, 30]);
    return yearlyMilestones.filter((m) => targetYearsSet.has(m.year) || m.year === numYears);
  }, [yearlyMilestones, numYears]);

  // SVG Chart path calculation
  const svgChart = useMemo(() => {
    if (!chartData || chartData.length === 0) return null;
    const W = 600;
    const H = 200;
    const paddingX = 40;
    const paddingTop = 20;
    const paddingBottom = 30;
    const chartW = W - paddingX * 2;
    const chartH = H - paddingTop - paddingBottom;

    // NaN-safe number helper — ?? does NOT catch NaN, only null/undefined
    const safeN = (v: number | null | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

    const maxVal = Math.max(...chartData.map((d) => safeN(d.portfolio_value)), 1);
    const count = chartData.length;

    const points = chartData.map((d, i) => {
      const x = paddingX + (i / Math.max(1, count - 1)) * chartW;
      const yBal = H - paddingBottom - (safeN(d.portfolio_value) / maxVal) * chartH;
      const yInv = H - paddingBottom - (safeN(d.total_invested) / maxVal) * chartH;
      return { x, yBal, yInv, year: d.year, balance: safeN(d.portfolio_value), invested: safeN(d.total_invested) };
    });

    const balLineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.yBal.toFixed(1)}`).join(' ');
    const invLineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.yInv.toFixed(1)}`).join(' ');
    const firstP = points[0];
    const lastP = points[points.length - 1];
    const areaD = `${balLineD} L ${lastP.x.toFixed(1)} ${(H - paddingBottom).toFixed(1)} L ${firstP.x.toFixed(1)} ${(H - paddingBottom).toFixed(1)} Z`;

    return { W, H, points, balLineD, invLineD, areaD, maxVal, paddingX, paddingBottom };
  }, [chartData]);

  return (
    <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* ── Header & Currency Switcher Controls ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800, color: '#f8fafc', fontFamily: 'Outfit, sans-serif' }}>
              🧮 DCA Calculator
            </h3>
            <span className="badge badge-blue" style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
              Active Currency: {activeCurrency} ({symbol})
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            จำลองการลงทุนแบบ Dollar-Cost Averaging (Compound Growth & Dividend Reinvestment)
          </p>
        </div>

        {/* Currency Switcher Pill */}
        <div
          style={{
            display: 'inline-flex',
            background: 'rgba(15,23,42,0.85)',
            padding: '3px',
            borderRadius: '10px',
            border: '1px solid var(--border)',
          }}
        >
          <button
            type="button"
            onClick={() => handleCurrencyToggle('USD')}
            style={{
              padding: '6px 14px',
              fontSize: '0.82rem',
              borderRadius: '8px',
              border: 'none',
              background: activeCurrency === 'USD' ? 'var(--primary)' : 'transparent',
              color: activeCurrency === 'USD' ? '#fff' : 'var(--text-muted)',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            USD ($)
          </button>
          <button
            type="button"
            onClick={() => handleCurrencyToggle('THB')}
            style={{
              padding: '6px 14px',
              fontSize: '0.82rem',
              borderRadius: '8px',
              border: 'none',
              background: activeCurrency === 'THB' ? 'var(--yellow)' : 'transparent',
              color: activeCurrency === 'THB' ? '#090d16' : 'var(--text-muted)',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            THB (฿)
          </button>
        </div>
      </div>

      {/* ── Ticker Selection & Quick Pills ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(15,23,42,0.4)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', alignItems: 'center' }}>
          <div>
            <label htmlFor="dca-proj-ticker" style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0' }}>
              Ticker (Optional Auto-fill)
            </label>
            <input
              id="dca-proj-ticker"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="e.g. VOO, SCHD, NVDA"
              className="glass-input"
              style={{ width: '100%', padding: '8px 12px' }}
            />
          </div>

          <div>
            <label htmlFor="dca-proj-yield" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0' }}>
              Dividend yield (%/yr) / Dividend Yield (%/ปี)
              {dividendYieldSource === 'backend' && (
                <span className="badge badge-green" style={{ fontSize: '0.65rem', padding: '2px 6px' }} title="ดึงข้อมูลจริงจาก backend">
                  🔗 จาก Backend
                </span>
              )}
            </label>
            <input
              id="dca-proj-yield"
              type="number"
              step="0.1"
              value={dividendYieldPct}
              onChange={(e) => {
                setDividendYieldPct(e.target.value);
                setDividendYieldSource('manual');
              }}
              placeholder="e.g. 3.5"
              className="glass-input"
              style={{ width: '100%', padding: '8px 12px' }}
            />
          </div>

          <div>
            <label htmlFor="dca-proj-growth" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0' }}>
              Price growth (%/yr) / Capital Growth (%/ปี)
              {priceGrowthSource === 'backend' && (
                <span className="badge badge-green" style={{ fontSize: '0.65rem', padding: '2px 6px' }} title="ดึงข้อมูลจริงจาก backend">
                  🔗 จาก Backend
                </span>
              )}
            </label>
            <input
              id="dca-proj-growth"
              type="number"
              step="0.1"
              value={priceGrowthRatePct}
              onChange={(e) => {
                setPriceGrowthRatePct(e.target.value);
                setPriceGrowthSource('manual');
                setGrowthYearsUsed(null); // a hand-typed number has no "years of history" behind it
              }}
              placeholder="e.g. 7.0"
              className="glass-input"
              style={{ width: '100%', padding: '8px 12px' }}
            />
            {growthYearsUsed != null && growthYearsUsed < SHORT_HISTORY_THRESHOLD_YEARS && (
              <p
                role="alert"
                style={{ margin: '6px 0 0 0', fontSize: '0.74rem', color: 'var(--yellow)', lineHeight: 1.4 }}
              >
                ⚠️ คำนวณจากข้อมูลราคาย้อนหลังแค่ {growthYearsUsed.toFixed(1)} ปี (หุ้น/กองทุนนี้เพิ่งเข้าตลาดไม่นาน) —
                ตัวเลขนี้เป็นข้อมูลจริง แต่ช่วงเวลาสั้นอาจไม่สะท้อนอัตราเติบโตระยะยาวที่แท้จริง
              </p>
            )}
          </div>
        </div>

        {/* Quick Select Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Popular Stocks:</span>
          {QUICK_PILLS.map((pill) => (
            <button
              key={pill}
              type="button"
              onClick={() => handleSelectTicker(pill)}
              className="glass-btn-primary"
              style={{
                padding: '4px 12px',
                fontSize: '0.75rem',
                borderRadius: '16px',
                background: ticker === pill ? 'rgba(56,189,248,0.25)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${ticker === pill ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}`,
                color: ticker === pill ? '#38bdf8' : '#e2e8f0',
                cursor: 'pointer',
              }}
            >
              ⚡ {pill}
            </button>
          ))}
        </div>
      </div>

      {/* ── Interactive Input Sliders ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '18px' }}>
        {/* Initial Capital Slider */}
        <div className="glass-panel" style={{ padding: '16px', borderRadius: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label htmlFor="dca-proj-initial" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>
              Initial investment ({activeCurrency})
            </label>
            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--primary)' }}>
              {symbol}{safeFormat(numInitial)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={maxInitial}
            step={stepInitial}
            value={numInitial}
            onChange={(e) => setInitialInvestment(e.target.value)}
            style={{ width: '100%', accentColor: 'var(--primary)', cursor: 'pointer', marginBottom: '10px' }}
          />
          <input
            id="dca-proj-initial"
            type="number"
            value={initialInvestment}
            onChange={(e) => setInitialInvestment(e.target.value)}
            className="glass-input"
            style={{ width: '100%', padding: '6px 10px', fontSize: '0.88rem' }}
          />
        </div>

        {/* Monthly DCA Slider */}
        <div className="glass-panel" style={{ padding: '16px', borderRadius: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label htmlFor="dca-proj-monthly" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>
              Monthly contribution ({activeCurrency})
            </label>
            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--green)' }}>
              {symbol}{safeFormat(numMonthly)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={maxMonthly}
            step={stepMonthly}
            value={numMonthly}
            onChange={(e) => setMonthlyContribution(e.target.value)}
            style={{ width: '100%', accentColor: 'var(--green)', cursor: 'pointer', marginBottom: '10px' }}
          />
          <input
            id="dca-proj-monthly"
            type="number"
            value={monthlyContribution}
            onChange={(e) => setMonthlyContribution(e.target.value)}
            className="glass-input"
            style={{ width: '100%', padding: '6px 10px', fontSize: '0.88rem' }}
          />
        </div>

        {/* Horizon Years Slider */}
        <div className="glass-panel" style={{ padding: '16px', borderRadius: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label htmlFor="dca-proj-years" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>
              Investment Horizon (Years: 1–30)
            </label>
            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--yellow)' }}>
              {numYears} Years
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={30}
            step={1}
            value={numYears}
            onChange={(e) => setYears(e.target.value)}
            style={{ width: '100%', accentColor: 'var(--yellow)', cursor: 'pointer', marginBottom: '10px' }}
          />
          <input
            id="dca-proj-years"
            type="number"
            min="1"
            max="30"
            value={years}
            onChange={(e) => setYears(e.target.value)}
            className="glass-input"
            style={{ width: '100%', padding: '6px 10px', fontSize: '0.88rem' }}
          />
        </div>
      </div>

      {/* Tax & Reinvestment Options */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', background: 'rgba(15,23,42,0.3)', padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label htmlFor="dca-proj-reinvest" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem', color: '#f8fafc' }}>
            <input
              id="dca-proj-reinvest"
              type="checkbox"
              checked={reinvestDividends}
              onChange={(e) => setReinvestDividends(e.target.checked)}
              style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }}
            />
            Reinvest dividends (Compounding Effect)
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="dca-proj-tax" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            Dividend Tax Rate (%):
          </label>
          <input
            id="dca-proj-tax"
            type="number"
            value={taxRatePct}
            onChange={(e) => setTaxRatePct(e.target.value)}
            className="glass-input"
            style={{ width: '64px', padding: '4px 8px', fontSize: '0.82rem', textAlign: 'center' }}
          />
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            (Net yield after {numTax}% WHT: {((numYield * (1 - numTax / 100))).toFixed(2)}%)
          </span>
        </div>
      </div>

      {/* ── Summary Hero Banner ── */}
      <div
        style={{
          borderRadius: '16px',
          background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.22) 0%, rgba(3, 105, 161, 0.35) 100%)',
          border: '1px solid rgba(56, 189, 248, 0.4)',
          padding: '24px',
          boxShadow: '0 10px 30px -10px rgba(56, 189, 248, 0.25)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px',
        }}
      >
        <div>
          <div style={{ fontSize: '0.9rem', color: '#93c5fd', fontWeight: 600, marginBottom: '4px' }}>
            มูลค่าพอร์ตหลัง {numYears} ปี (Portfolio value after {numYears} years)
          </div>
          <div style={{ fontSize: '2.4rem', fontWeight: 900, color: '#ffffff', fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.02em' }}>
            {formatCompact(finalPortfolioValue, symbol)}
            <span style={{ fontSize: '1.2rem', fontWeight: 600, color: '#93c5fd', marginLeft: '12px' }}>
              ({symbol}{safeFormat(finalPortfolioValue)})
            </span>
          </div>
          <div style={{ fontSize: '0.84rem', color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>
            เงินลงทุนรวม: {symbol}{safeFormat(totalInvested)}
          </div>
        </div>

        <div
          style={{
            background: 'rgba(255, 255, 255, 0.12)',
            backdropFilter: 'blur(8px)',
            padding: '12px 20px',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '0.78rem', color: '#e0f2fe', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            อัตราเติบโตเงินพอร์ต
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#38bdf8', marginTop: '2px' }}>
            เงินเพิ่มขึ้น {multiplier.toFixed(2)}x
          </div>
        </div>
      </div>

      {/* ── Income Breakdown Card Grid ── */}
      <div>
        <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>
          📊 Income Breakdown (ภาพรวมผลตอบแทน)
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
          <div className="glass-stat-card" style={{ borderColor: 'rgba(252, 211, 77, 0.35)', background: 'rgba(252, 211, 77, 0.04)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>💰 ปันผลสะสม (Accumulated Net Div)</div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fcd34d', marginTop: '6px' }}>
              {symbol}{safeFormat(accumulatedDividend)}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              ปันผลสุทธิหลังหักภาษี {numTax}%
            </div>
          </div>

          <div className="glass-stat-card" style={{ borderColor: 'rgba(52, 211, 153, 0.35)', background: 'rgba(52, 211, 153, 0.04)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>📈 กำไรราคา (Capital Gain)</div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#34d399', marginTop: '6px' }}>
              {symbol}{safeFormat(capitalGain)}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              ส่วนต่างราคาจากการเติบโต
            </div>
          </div>

          <div className="glass-stat-card" style={{ borderColor: 'rgba(56, 189, 248, 0.35)', background: 'rgba(56, 189, 248, 0.04)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>🎯 กำไรรวม (Total Return)</div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#38bdf8', marginTop: '6px' }}>
              {symbol}{safeFormat(totalReturn)}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              ภาษีหัก ณ ที่จ่าย ({numTax}%): {symbol}{safeFormat(taxAmount)}
            </div>
          </div>
        </div>
      </div>

      {/* ── Monthly Income at End Grid ── */}
      <div>
        <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>
          💵 รายได้/เดือน ณ สิ้นสุดการลงทุน (Year {numYears} Monthly Income)
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
          <div className="glass-stat-card" style={{ borderColor: 'rgba(251, 191, 36, 0.3)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>💰 ปันผล/เดือน (Monthly Dividend)</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fcd34d', marginTop: '4px' }}>
              Net monthly dividend at year {numYears}: {symbol}{safeFormat(finalMonthlyDividend)}
            </div>
          </div>

          <div className="glass-stat-card" style={{ borderColor: 'rgba(16, 185, 129, 0.3)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>📈 ราคา/เดือน (Monthly Growth)</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#34d399', marginTop: '4px' }}>
              {symbol}{safeFormat(finalMonthlyGrowth)}
            </div>
          </div>

          <div className="glass-stat-card" style={{ borderColor: 'rgba(14, 165, 233, 0.3)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>🎯 Total/เดือน (Total Monthly Return)</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#38bdf8', marginTop: '4px' }}>
              {symbol}{safeFormat(finalMonthlyTotal)}
            </div>
          </div>
        </div>
      </div>

      {/* ── Visual Growth SVG Trajectory Chart ── */}
      {svgChart && (
        <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>
              📈 Portfolio Trajectory Chart (การเติบโต 1–{numYears} ปี)
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.78rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8' }}>
                <span style={{ width: '12px', height: '3px', background: '#38bdf8', borderRadius: '2px' }} /> Portfolio Value
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8' }}>
                <span style={{ width: '12px', height: '2px', background: '#64748b', borderStyle: 'dashed' }} /> Invested Capital
              </span>
            </div>
          </div>

          <div style={{ width: '100%', overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${svgChart.W} ${svgChart.H}`} style={{ width: '100%', height: 'auto', minWidth: '450px' }}>
              <defs>
                <linearGradient id="dcaAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              {[0, 0.33, 0.66, 1].map((ratio) => {
                const y = svgChart.H - svgChart.paddingBottom - ratio * (svgChart.H - 50);
                return (
                  <line
                    key={ratio}
                    x1={svgChart.paddingX}
                    y1={y}
                    x2={svgChart.W - svgChart.paddingX}
                    y2={y}
                    stroke="rgba(255,255,255,0.06)"
                    strokeDasharray="4 4"
                  />
                );
              })}

              {/* Area Fill */}
              <path d={svgChart.areaD} fill="url(#dcaAreaGrad)" />

              {/* Invested Capital Line */}
              <path d={svgChart.invLineD} fill="none" stroke="#64748b" strokeWidth="2" strokeDasharray="5 5" />

              {/* Portfolio Value Line */}
              <path d={svgChart.balLineD} fill="none" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" />

              {/* Points & Labels */}
              {svgChart.points.map((p, idx) => {
                const showLabel = idx === 0 || idx === svgChart.points.length - 1 || (idx + 1) % 5 === 0;
                return (
                  <g key={p.year}>
                    <circle cx={p.x} cy={p.yBal} r={showLabel ? 4 : 2} fill="#38bdf8" stroke="#0f172a" strokeWidth="2" />
                    {showLabel && (
                      <text x={p.x} y={svgChart.H - 8} textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="600">
                        Yr {p.year}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}

      {/* ── Yearly Milestone Cards ── */}
      {filteredMilestones.length > 0 && (
        <div>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>
            🏁 Yearly Milestone Cards (เป้าหมายรายปี)
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
            {filteredMilestones.map((m) => (
              <div key={m.year} className="glass-panel" style={{ padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#f8fafc' }}>Milestone Yr {m.year}</span>
                  <span style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--primary)' }}>
                    {symbol}{safeFormat(m.portfolio_value)}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '0.74rem' }}>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>💰 ปันผล/ด.</div>
                    <div style={{ fontWeight: 700, color: '#fcd34d', marginTop: '2px' }}>
                      {symbol}{safeFormat(m.monthly_dividend)}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>📈 ราคา/ด.</div>
                    <div style={{ fontWeight: 700, color: '#34d399', marginTop: '2px' }}>
                      {symbol}{safeFormat(m.monthly_growth)}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>🎯 Total/ด.</div>
                    <div style={{ fontWeight: 700, color: '#38bdf8', marginTop: '2px' }}>
                      {symbol}{safeFormat(m.monthly_total)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Yearly Breakdown Table (1–N Years) ── */}
      <div style={{ marginTop: '6px' }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>
          📊 Yearly Breakdown (1–{numYears} Years)
        </h4>
        <div style={{ overflowX: 'auto' }}>
          <table className="zebra-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                <th style={{ padding: '10px 12px' }}>Year</th>
                <th style={{ padding: '10px 12px' }}>Annual Contribution</th>
                <th style={{ padding: '10px 12px' }}>Dividend/Interest Earned</th>
                <th style={{ padding: '10px 12px' }}>Withheld Tax ({numTax}%)</th>
                <th style={{ padding: '10px 12px' }}>Ending Portfolio Balance</th>
              </tr>
            </thead>
            <tbody>
              {yearlyBreakdown.map((row) => (
                <tr key={row.year} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.88rem' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#f8fafc' }}>Year {row.year}</td>
                  <td style={{ padding: '10px 12px' }}>
                    {symbol}{safeFormat(row.annualContributionThb)}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#fcd34d' }}>
                    {symbol}{safeFormat(row.grossAnnualDividendThb)}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#fb7185' }}>
                    {symbol}{safeFormat(row.annualTaxWithheldThb)}
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--primary)' }}>
                    {symbol}{safeFormat(row.portfolioValueThb)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

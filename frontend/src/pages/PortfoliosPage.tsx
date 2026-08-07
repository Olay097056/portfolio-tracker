// frontend/src/pages/PortfoliosPage.tsx
import { useEffect, useState } from 'react';
import {
  adjustPortfolioCash,
  createTransaction,
  getMarketData,
  getPortfolioSummary,
  getUsdToThbRate,
  listTransactions,
  type Transaction,
} from '../api/client';
import type { MarketData, PortfolioSummary } from '../api/types';
import { AddPortfolioForm } from '../components/AddPortfolioForm';
import { PortfolioCard } from '../components/PortfolioCard';
import { PortfolioHoldings } from '../components/PortfolioHoldings';
import { TickerAutocomplete } from '../components/TickerAutocomplete';
import { usePortfolios } from '../hooks/usePortfolios';

export function PortfoliosPage() {
  const { portfolios, loading, error, create, update, remove, rebalanceTargets, refresh } = usePortfolios();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selectedPortfolioTab, setSelectedPortfolioTab] = useState<number | 'ALL'>('ALL');

  // Display Mode: V1 (Easy / Overview) vs V2 (Precise / Transaction Ledger)
  const [displayMode, setDisplayMode] = useState<'V1' | 'V2'>('V1');

  // FX Rate State
  const [currency, setCurrency] = useState<'USD' | 'THB'>('USD');
  const [fxRate, setFxRate] = useState<number>(33.38);

  // Aggregated Summaries and Market Data
  const [summaries, setSummaries] = useState<Record<number, PortfolioSummary>>({});
  const [marketData, setMarketData] = useState<Record<string, MarketData>>({});
  const [transactions, setTransactions] = useState<Record<number, Transaction[]>>({});

  // Modal States
  const [cashModalOpen, setCashModalOpen] = useState<boolean>(false);
  const [cashModalPortfolioId, setCashModalPortfolioId] = useState<number | null>(null);
  const [cashType, setCashType] = useState<'CASH_DEPOSIT' | 'CASH_WITHDRAW'>('CASH_DEPOSIT');
  const [cashAmount, setCashAmount] = useState<string>('');
  const [cashNote, setCashNote] = useState<string>('');
  const [cashSubmitting, setCashSubmitting] = useState<boolean>(false);
  const [cashError, setCashError] = useState<string | null>(null);

  // Transaction Modal State (V2 Batch Wizard)
  const [txModalOpen, setTxModalOpen] = useState<boolean>(false);
  const [txPortfolioId, setTxPortfolioId] = useState<number>(0);
  const [txType, setTxType] = useState<'BUY' | 'SELL' | 'CASH_DEPOSIT' | 'CASH_WITHDRAW' | 'DIVIDEND'>('BUY');
  const [txTicker, setTxTicker] = useState<string>('');
  const [txShares, setTxShares] = useState<string>('');
  const [txPrice, setTxPrice] = useState<string>('');
  const [txAmountUsd, setTxAmountUsd] = useState<string>('');
  const [txNote, setTxNote] = useState<string>('');
  const [txSubmitting, setTxSubmitting] = useState<boolean>(false);

  // Fetch FX Rate
  useEffect(() => {
    getUsdToThbRate()
      .then((rate) => {
        if (rate) setFxRate(rate);
      })
      .catch(() => {});
  }, []);

  const portfolioIdsKey = portfolios.map((p) => p.id).join(',');

  // Fetch summaries for all portfolios
  useEffect(() => {
    if (!portfolioIdsKey) {
      setSummaries({});
      return;
    }

    let isMounted = true;
    Promise.all(portfolios.map((p) => getPortfolioSummary(p.id).catch(() => null))).then((results) => {
      if (!isMounted) return;
      const summaryMap: Record<number, PortfolioSummary> = {};
      results.forEach((s) => {
        if (s) summaryMap[s.id] = s;
      });
      setSummaries(summaryMap);
    });

    return () => {
      isMounted = false;
    };
  }, [portfolioIdsKey]);

  const holdingsTickerKey = Array.from(
    new Set(Object.values(summaries).flatMap((s) => (s.holdings || []).map((h) => h.ticker)))
  )
    .filter(Boolean)
    .sort()
    .join(',');

  // Fetch market data for all active holdings across all portfolios
  useEffect(() => {
    if (!holdingsTickerKey) return;
    const tickers = holdingsTickerKey.split(',');

    let isMounted = true;
    getMarketData(tickers)
      .then((data) => {
        if (isMounted && data) {
          setMarketData(data);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [holdingsTickerKey]);

  // Fetch transactions log when in V2 mode
  useEffect(() => {
    if (displayMode !== 'V2' || !portfolioIdsKey) return;

    let isMounted = true;
    Promise.all(portfolios.map((p) => listTransactions(p.id).catch(() => []))).then((results) => {
      if (!isMounted) return;
      const txMap: Record<number, Transaction[]> = {};
      portfolios.forEach((p, index) => {
        txMap[p.id] = results[index] || [];
      });
      setTransactions(txMap);
    });

    return () => {
      isMounted = false;
    };
  }, [displayMode, portfolioIdsKey]);

  const multiplier = currency === 'THB' ? fxRate : 1;
  const currencySymbol = currency === 'THB' ? '฿' : '$';

  function toggleHoldings(id: number) {
    setExpandedId((current) => (current === id ? null : id));
  }

  // Handle Cash Deposit / Withdrawal Submit
  async function handleCashSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cashModalPortfolioId) return;
    const amountNum = parseFloat(cashAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setCashError('กรุณาระบุจำนวนเงินสดที่ถูกต้อง (Amount must be > 0)');
      return;
    }

    setCashSubmitting(true);
    setCashError(null);

    try {
      await adjustPortfolioCash(cashModalPortfolioId, cashType, amountNum, cashNote);
      setCashModalOpen(false);
      setCashAmount('');
      setCashNote('');
      refresh();
    } catch (err: any) {
      setCashError(err.message || 'เกิดข้อผิดพลาดในการฝาก-ถอนเงินสด');
    } finally {
      setCashSubmitting(false);
    }
  }

  // Handle Single Transaction Submission
  async function handleTxSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pid = txPortfolioId || portfolios[0]?.id;
    if (!pid) return;

    const amountNum = parseFloat(txAmountUsd) || (parseFloat(txShares) * parseFloat(txPrice)) || 0;
    if (amountNum <= 0) return;

    setTxSubmitting(true);
    try {
      await createTransaction(pid, {
        ticker: txTicker ? txTicker.toUpperCase() : null,
        type: txType,
        shares: txShares ? parseFloat(txShares) : null,
        price: txPrice ? parseFloat(txPrice) : null,
        amount_usd: amountNum,
        note: txNote || null,
      });
      setTxModalOpen(false);
      setTxTicker('');
      setTxShares('');
      setTxPrice('');
      setTxAmountUsd('');
      setTxNote('');
      refresh();
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาดในการสร้างรายการ');
    } finally {
      setTxSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading portfolios…
      </div>
    );
  }

  // --- Aggregate Top-Level KPI Calculations ---
  const totalCashUsd = portfolios.reduce((sum, p) => sum + (p.cash_usd || 0), 0);
  const summaryValues = Object.values(summaries);
  const hasSummaries = summaryValues.length > 0;

  const totalPortfolioValueUsd = hasSummaries
    ? summaryValues.reduce((sum, s) => sum + (s.total_value || 0), 0)
    : totalCashUsd;

  const totalHoldingsMarketValueUsd = hasSummaries
    ? summaryValues.reduce((sum, s) => sum + (s.holdings_value || 0), 0)
    : 0;

  const totalUnrealizedPnlUsd = summaryValues.reduce((sum, s) => sum + (s.unrealized_pnl || 0), 0);
  const totalRealizedPnlUsd = summaryValues.reduce((sum, s) => sum + (s.realized_pnl || 0), 0);

  let totalCostBasisUsd = 0;
  let totalAnnualDividendUsd = 0;

  summaryValues.forEach((s) => {
    (s.holdings || []).forEach((h) => {
      totalCostBasisUsd += (h.shares || 0) * (h.avg_cost_usd || 0);
      const yieldPct = marketData[h.ticker]?.dividend_yield_pct ?? 0;
      totalAnnualDividendUsd += (h.value || 0) * (yieldPct / 100);
    });
  });

  const totalUnrealizedPnlPct = totalCostBasisUsd > 0
    ? (totalUnrealizedPnlUsd / totalCostBasisUsd) * 100
    : 0;

  const averageDividendYieldPct = (totalPortfolioValueUsd - totalCashUsd) > 0
    ? (totalAnnualDividendUsd / (totalPortfolioValueUsd - totalCashUsd)) * 100
    : 0;

  const filteredPortfolios = selectedPortfolioTab === 'ALL'
    ? portfolios
    : portfolios.filter((p) => p.id === selectedPortfolioTab);

  const allTransactionsList = Object.entries(transactions).flatMap(([pid, list]) =>
    list.map((tx) => ({ ...tx, portfolioName: portfolios.find((p) => p.id === Number(pid))?.name || 'Portfolio' }))
  ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div>
      {/* ── Page Header & wethaiinvest Mode & Currency Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800 }}>💼 พอร์ตของฉัน (Portfolios)</h2>
            <span className="badge badge-blue" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>v1.9.13 wethaiinvest style</span>
          </div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>บริหารจัดการพอร์ตการลงทุน ติดตามมูลค่า กำไร/ขาดทุน และเงินปันผลหุ้นอเมริกา</span>
        </div>

        {/* Control Toolbar: Display Mode + Currency Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Mode Switcher: Easy (V1) vs Precise (V2) */}
          <div style={{ display: 'inline-flex', background: 'rgba(15,23,42,0.8)', padding: '3px', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => setDisplayMode('V1')}
              style={{
                padding: '5px 14px',
                fontSize: '0.8rem',
                borderRadius: '8px',
                border: 'none',
                background: displayMode === 'V1' ? 'var(--primary)' : 'transparent',
                color: displayMode === 'V1' ? '#fff' : 'var(--text-muted)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              โหมดง่าย (V1)
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('V2')}
              style={{
                padding: '5px 14px',
                fontSize: '0.8rem',
                borderRadius: '8px',
                border: 'none',
                background: displayMode === 'V2' ? '#10b981' : 'transparent',
                color: displayMode === 'V2' ? '#fff' : 'var(--text-muted)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              โหมดแม่นยำ (V2)
            </button>
          </div>

          {/* Currency Switcher Pill */}
          <div style={{ display: 'inline-flex', background: 'rgba(15,23,42,0.8)', padding: '3px', borderRadius: '10px', border: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => setCurrency('USD')}
              style={{
                padding: '5px 14px',
                fontSize: '0.8rem',
                borderRadius: '8px',
                border: 'none',
                background: currency === 'USD' ? 'var(--primary)' : 'transparent',
                color: currency === 'USD' ? '#fff' : 'var(--text-muted)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              USD ($)
            </button>
            <button
              type="button"
              onClick={() => setCurrency('THB')}
              style={{
                padding: '5px 14px',
                fontSize: '0.8rem',
                borderRadius: '8px',
                border: 'none',
                background: currency === 'THB' ? '#fcd34d' : 'transparent',
                color: currency === 'THB' ? '#000' : 'var(--text-muted)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              THB (฿)
            </button>
          </div>

          <span className="badge badge-blue" style={{ fontSize: '0.75rem', padding: '5px 10px' }}>
            1 USD = {fxRate.toFixed(3)} THB
          </span>
        </div>
      </div>

      {/* ── Top 5 Portfolio Performance KPI Summary Cards (wethaiinvest Style) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {/* KPI 1: Market Value / Cost Basis */}
        <div className="card" style={{ margin: 0, padding: '16px 20px', background: 'rgba(15, 23, 42, 0.85)', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>มูลค่าหุ้น / ต้นทุน</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: '#f8fafc', marginTop: '4px' }}>
            {currencySymbol}{(totalHoldingsMarketValueUsd * multiplier).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            ต้นทุน: {currencySymbol}{(totalCostBasisUsd * multiplier).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {/* KPI 2: Unrealized P&L ("กำไร/ขาดทุน ทิพย์") */}
        <div className="card" style={{ margin: 0, padding: '16px 20px', background: 'rgba(15, 23, 42, 0.85)', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>กำไร/ขาดทุน "ทิพย์"</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: totalUnrealizedPnlUsd >= 0 ? 'var(--green)' : 'var(--red)', marginTop: '4px' }}>
            {totalUnrealizedPnlUsd >= 0 ? '+' : ''}{currencySymbol}{(totalUnrealizedPnlUsd * multiplier).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '0.8rem', color: totalUnrealizedPnlUsd >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
            ({totalUnrealizedPnlPct >= 0 ? '+' : ''}{totalUnrealizedPnlPct.toFixed(2)}%)
          </span>
        </div>

        {/* KPI 3: Realized P&L ("กำไร ล็อคแล้ว") */}
        <div className="card" style={{ margin: 0, padding: '16px 20px', background: 'rgba(15, 23, 42, 0.85)', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>กำไร "ล็อคแล้ว"</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: totalRealizedPnlUsd >= 0 ? 'var(--green)' : 'var(--red)', marginTop: '4px' }}>
            {totalRealizedPnlUsd >= 0 ? '+' : ''}{currencySymbol}{(totalRealizedPnlUsd * multiplier).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Realized Locked Profit</span>
        </div>

        {/* KPI 4: Cash Balance & Deposit/Withdraw Action */}
        <div className="card" style={{ margin: 0, padding: '16px 20px', background: 'rgba(15, 23, 42, 0.85)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>เงินสดคงเหลือ</span>
            {portfolios.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setCashModalPortfolioId(portfolios[0].id);
                  setCashModalOpen(true);
                }}
                style={{ padding: '2px 8px', fontSize: '0.7rem', borderRadius: '6px', background: 'rgba(56,189,248,0.2)', color: 'var(--primary)', border: '1px solid var(--primary)' }}
              >
                💰 ฝาก/ถอน
              </button>
            )}
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: '#10b981', marginTop: '4px' }}>
            {currencySymbol}{(totalCashUsd * multiplier).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Buying Power</span>
        </div>

        {/* KPI 5: Total Portfolio Value & Dividend Income */}
        <div className="card" style={{ margin: 0, padding: '16px 20px', background: 'rgba(15, 23, 42, 0.85)', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>มูลค่าพอร์ตรวมทั้งหมด</span>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: 'var(--primary)', marginTop: '4px' }}>
            {currencySymbol}{(totalPortfolioValueUsd * multiplier).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '0.8rem', color: '#fcd34d', fontWeight: 600 }}>
            ปันผล: {currencySymbol}{(totalAnnualDividendUsd * multiplier).toLocaleString(undefined, { minimumFractionDigits: 2 })}/yr ({averageDividendYieldPct.toFixed(2)}%)
          </span>
        </div>
      </div>

      {error && <div role="alert" style={{ marginBottom: '16px' }}>{error}</div>}

      {/* ── Mode V2 Special Quick Action Bar ── */}
      {displayMode === 'V2' && portfolios.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setTxModalOpen(true)}
            style={{ padding: '10px 18px', fontSize: '0.85rem', fontWeight: 700, borderRadius: '8px', background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            ➕ ทำรายการซื้อขาย (Add Transaction)
          </button>
          <button
            type="button"
            onClick={() => alert('ฟังก์ชั่น Import CSV พร้อมใช้งานในโหมดแม่นยำ V2 (Dime / Webull / M1 format)')}
            style={{ padding: '10px 18px', fontSize: '0.85rem', fontWeight: 600, borderRadius: '8px', background: 'rgba(56,189,248,0.15)', color: 'var(--primary)', border: '1px solid var(--primary)', cursor: 'pointer' }}
          >
            📥 Import CSV (Dime / Webull)
          </button>
          <span className="badge badge-blue" style={{ alignSelf: 'center', fontSize: '0.78rem' }}>
            Cost Basis: COMPRESSED_FIFO / Average Cost
          </span>
        </div>
      )}

      {/* ── Add Portfolio Form Section ── */}
      <div className="card" style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid var(--border)', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <span style={{ fontSize: '1.1rem' }}>➕</span>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>เพิ่มพอร์ตการลงทุนใหม่ (Create Portfolio)</h3>
        </div>
        <AddPortfolioForm onSubmit={create} />
      </div>

      {/* ── Portfolio Selector Tab Bar (wethaiinvest Style) ── */}
      {portfolios.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
          <button
            type="button"
            onClick={() => setSelectedPortfolioTab('ALL')}
            style={{
              padding: '8px 18px',
              fontSize: '0.85rem',
              fontWeight: 600,
              borderRadius: '8px',
              background: selectedPortfolioTab === 'ALL' ? 'rgba(56,189,248,0.2)' : 'rgba(15,23,42,0.6)',
              borderColor: selectedPortfolioTab === 'ALL' ? 'var(--primary)' : 'var(--border)',
              color: selectedPortfolioTab === 'ALL' ? 'var(--primary)' : 'var(--text)',
              cursor: 'pointer',
            }}
          >
            🌐 พอร์ตทั้งหมด (All)
          </button>

          {portfolios.map((p) => {
            const pSummary = summaries[p.id];
            const currentRatioPct = totalPortfolioValueUsd > 0 && pSummary
              ? (pSummary.total_value / totalPortfolioValueUsd) * 100
              : 0;
            const targetRatioPct = p.target_allocation_pct ?? 100;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPortfolioTab(p.id)}
                style={{
                  padding: '8px 18px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  borderRadius: '8px',
                  background: selectedPortfolioTab === p.id ? 'rgba(56,189,248,0.2)' : 'rgba(15,23,42,0.6)',
                  borderColor: selectedPortfolioTab === p.id ? 'var(--primary)' : 'var(--border)',
                  color: selectedPortfolioTab === p.id ? 'var(--primary)' : 'var(--text)',
                  cursor: 'pointer',
                }}
              >
                💼 {p.name} ({currentRatioPct.toFixed(1)}% / {targetRatioPct.toFixed(0)}%)
              </button>
            );
          })}
        </div>
      )}

      {/* ── Portfolios List ── */}
      {portfolios.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No portfolios yet — add one above.</p>
      ) : (
        filteredPortfolios.map((portfolio) => (
          <div key={portfolio.id} className="card" style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid var(--border)', marginBottom: '20px' }}>
            <PortfolioCard
              portfolio={portfolio}
              allPortfolios={portfolios}
              onDelete={remove}
              onUpdate={update}
              onRebalance={rebalanceTargets}
              onToggleHoldings={toggleHoldings}
              expanded={expandedId === portfolio.id || selectedPortfolioTab === portfolio.id}
              currencyMultiplier={multiplier}
              currencySymbol={currencySymbol}
            />
            {(expandedId === portfolio.id || selectedPortfolioTab === portfolio.id) && (
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                {/* Portfolio Cash Action Banner */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(16, 185, 129, 0.1)', padding: '10px 16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <div>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#10b981' }}>💵 เงินสดคงเหลือในพอร์ตนี้: </span>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: '#fff', fontFamily: 'Outfit, sans-serif' }}>
                      {currencySymbol}{(portfolio.cash_usd * multiplier).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCashModalPortfolioId(portfolio.id);
                      setCashModalOpen(true);
                    }}
                    style={{ padding: '6px 14px', fontSize: '0.8rem', fontWeight: 600, background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                  >
                    💰 ฝาก / ถอน เงินสด
                  </button>
                </div>

                <PortfolioHoldings portfolioId={portfolio.id} currencyMultiplier={multiplier} currencySymbol={currencySymbol} />
              </div>
            )}
          </div>
        ))
      )}

      {/* ── Transaction History Table Section (V2 Mode) ── */}
      {displayMode === 'V2' && allTransactionsList.length > 0 && (
        <div className="card" style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid var(--border)', marginTop: '28px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)' }}>📝 ประวัติรายการซื้อขายทั้งหมด (Transaction History Ledger)</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textTransform: 'uppercase', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  <th style={{ textAlign: 'left', padding: '8px' }}>วันที่ / เวลา</th>
                  <th style={{ textAlign: 'left', padding: '8px' }}>พอร์ต</th>
                  <th style={{ textAlign: 'center', padding: '8px' }}>ประเภท</th>
                  <th style={{ textAlign: 'left', padding: '8px' }}>หุ้น</th>
                  <th style={{ textAlign: 'right', padding: '8px' }}>จำนวนหุ้น</th>
                  <th style={{ textAlign: 'right', padding: '8px' }}>ราคา/หุ้น</th>
                  <th style={{ textAlign: 'right', padding: '8px' }}>มูลค่ารวม</th>
                  <th style={{ textAlign: 'left', padding: '8px' }}>บันทึกเพิ่มเติม</th>
                </tr>
              </thead>
              <tbody>
                {allTransactionsList.map((tx) => (
                  <tr key={tx.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{new Date(tx.created_at).toLocaleString('th-TH')}</td>
                    <td style={{ padding: '8px', fontWeight: 600 }}>{tx.portfolioName}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <span
                        className={`badge ${
                          tx.type === 'BUY'
                            ? 'badge-blue'
                            : tx.type === 'SELL'
                            ? 'badge-red'
                            : tx.type === 'DIVIDEND'
                            ? 'badge-yellow'
                            : 'badge-gray'
                        }`}
                        style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                      >
                        {tx.type}
                      </span>
                    </td>
                    <td style={{ padding: '8px', fontWeight: 700, color: 'var(--primary)' }}>{tx.ticker || '—'}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{tx.shares ? `${tx.shares} sh` : '—'}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{tx.price ? `${currencySymbol}${(tx.price * multiplier).toFixed(2)}` : '—'}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>
                      {currencySymbol}{(tx.amount_usd * multiplier).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{tx.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal 1: Cash Deposit / Withdraw Modal ── */}
      {cashModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '420px', background: '#0f172a', border: '1px solid var(--border)', padding: '24px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>💰 ฝาก / ถอน เงินสดในพอร์ต</h3>
              <button type="button" onClick={() => setCashModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>

            {cashError && <div role="alert" style={{ marginBottom: '12px', fontSize: '0.85rem' }}>{cashError}</div>}

            <form onSubmit={handleCashSubmit}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>เลือกประเภทรายการ</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setCashType('CASH_DEPOSIT')}
                    style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', background: cashType === 'CASH_DEPOSIT' ? '#10b981' : 'rgba(255,255,255,0.05)', color: cashType === 'CASH_DEPOSIT' ? '#fff' : 'var(--text-muted)', fontWeight: 700, cursor: 'pointer' }}
                  >
                    💵 ฝากเงินสด (+Deposit)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCashType('CASH_WITHDRAW')}
                    style={{ flex: 1, padding: '8px', borderRadius: '6px', border: 'none', background: cashType === 'CASH_WITHDRAW' ? 'var(--red)' : 'rgba(255,255,255,0.05)', color: cashType === 'CASH_WITHDRAW' ? '#fff' : 'var(--text-muted)', fontWeight: 700, cursor: 'pointer' }}
                  >
                    💸 ถอนเงินสด (-Withdraw)
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label htmlFor="cashAmountInput" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>จำนวนเงิน ({currencySymbol})</label>
                <input
                  id="cashAmountInput"
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '1rem', fontWeight: 700 }}
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label htmlFor="cashNoteInput" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>บันทึกเพิ่มเติม (Note)</label>
                <input
                  id="cashNoteInput"
                  type="text"
                  placeholder="เช่น ฝากปันผลเข้าพอร์ต, เติมเงินรายเดือน..."
                  value={cashNote}
                  onChange={(e) => setCashNote(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setCashModalOpen(false)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)' }}>ยกเลิก</button>
                <button type="submit" disabled={cashSubmitting} style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700 }}>
                  {cashSubmitting ? 'กำลังบันทึก…' : 'ยืนยัน'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal 2: Batch Transaction Modal (V2) ── */}
      {txModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '500px', background: '#0f172a', border: '1px solid var(--border)', padding: '24px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>➕ บันทึกรายการ ซื้อ/ขาย/ปันผล</h3>
              <button type="button" onClick={() => setTxModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleTxSubmit}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>เลือกพอร์ต</label>
                <select
                  value={txPortfolioId}
                  onChange={(e) => setTxPortfolioId(Number(e.target.value))}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                >
                  {portfolios.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>ประเภทรายการ</label>
                <select
                  value={txType}
                  onChange={(e) => setTxType(e.target.value as any)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontWeight: 700 }}
                >
                  <option value="BUY">🟢 BUY (ซื้อหุ้น)</option>
                  <option value="SELL">🔴 SELL (ขายหุ้น)</option>
                  <option value="DIVIDEND">🟡 DIVIDEND (รับปันผล)</option>
                  <option value="CASH_DEPOSIT">💵 CASH_DEPOSIT (ฝากเงิน)</option>
                  <option value="CASH_WITHDRAW">💸 CASH_WITHDRAW (ถอนเงิน)</option>
                </select>
              </div>

              {(txType === 'BUY' || txType === 'SELL' || txType === 'DIVIDEND') && (
                <div style={{ marginBottom: '12px' }}>
                  <label htmlFor="txTickerInput" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>ชื่อหุ้น (Ticker Symbol)</label>
                  <TickerAutocomplete
                    id="txTickerInput"
                    placeholder="เช่น AAPL, NVDA, JEPQ"
                    value={txTicker}
                    onChange={setTxTicker}
                    onSelect={(item) => setTxTicker(item.symbol)}
                    required={txType === 'BUY' || txType === 'SELL'}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: '#fff', textTransform: 'uppercase' }}
                  />
                </div>
              )}

              {(txType === 'BUY' || txType === 'SELL') && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label htmlFor="txSharesInput" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>จำนวนหุ้น (Shares)</label>
                    <input
                      id="txSharesInput"
                      type="number"
                      step="any"
                      placeholder="0.0"
                      value={txShares}
                      onChange={(e) => setTxShares(e.target.value)}
                      required
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                    />
                  </div>
                  <div>
                    <label htmlFor="txPriceInput" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>ราคา/หุ้น ($)</label>
                    <input
                      id="txPriceInput"
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={txPrice}
                      onChange={(e) => setTxPrice(e.target.value)}
                      required
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                    />
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '14px' }}>
                <label htmlFor="txAmountInput" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>มูลค่ารวม ($ USD)</label>
                <input
                  id="txAmountInput"
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={txAmountUsd || (parseFloat(txShares) && parseFloat(txPrice) ? (parseFloat(txShares) * parseFloat(txPrice)).toFixed(2) : '')}
                  onChange={(e) => setTxAmountUsd(e.target.value)}
                  required
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontWeight: 700 }}
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label htmlFor="txNoteInput" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>บันทึกเพิ่มเติม (Note)</label>
                <input
                  id="txNoteInput"
                  type="text"
                  placeholder="เช่น ซื้อเพิ่มช่วงย่อตัว..."
                  value={txNote}
                  onChange={(e) => setTxNote(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setTxModalOpen(false)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)' }}>ยกเลิก</button>
                <button type="submit" disabled={txSubmitting} style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: '#10b981', color: '#fff', fontWeight: 700 }}>
                  {txSubmitting ? 'กำลังบันทึก…' : 'ยืนยันทำรายการ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

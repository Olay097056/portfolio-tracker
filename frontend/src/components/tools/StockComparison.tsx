import { useState } from 'react';
import { compareAutocomplete, getCompareStock } from '../../api/client';
import type { ComparableStock } from '../../api/types';
import { TickerAutocomplete } from '../TickerAutocomplete';
import { buildComparisonSummary, type ComparisonSection } from '../../utils/stockComparisonSummary';

export const MAX_COMPARE_STOCKS = 4;

// Section order and row labels mirror konbalongtun.com/compare's own layout (captured
// 2026-08-08). `key` indexes into ComparableStock.metrics, which the backend maps from
// the upstream field names -- see backend/app/routers/compare.py's _METRIC_FIELD_MAP.
interface MetricRow {
  key: string;
  label: string;
}

interface SectionDef {
  id: ComparisonSection;
  title: string;
  icon: string;
  rows: MetricRow[];
}

const SECTIONS: SectionDef[] = [
  {
    id: 'valuation',
    title: 'มูลค่าและอัตราส่วน',
    icon: '📊',
    rows: [
      { key: 'market_cap', label: 'Market Cap' },
      { key: 'enterprise_value', label: 'Enterprise Value' },
      { key: 'pe_ratio', label: 'P/E Ratio' },
      { key: 'forward_pe', label: 'Forward P/E' },
      { key: 'peg_ratio', label: 'PEG Ratio' },
      { key: 'ps', label: 'P/S' },
      { key: 'pb', label: 'P/B' },
      { key: 'pc', label: 'P/C' },
      { key: 'pfcf', label: 'P/FCF' },
      { key: 'ev_sales', label: 'EV/Sales' },
      { key: 'ev_ebitda', label: 'EV/EBITDA' },
    ],
  },
  {
    id: 'performance',
    title: 'ผลการดำเนินงาน',
    icon: '📈',
    rows: [
      { key: 'perf_week', label: 'Perf Week' },
      { key: 'perf_month', label: 'Perf Month' },
      { key: 'perf_quarter', label: 'Perf Quarter' },
      { key: 'perf_half_y', label: 'Perf Half Y' },
      { key: 'perf_year', label: 'Perf Year' },
      { key: 'perf_ytd', label: 'Perf YTD' },
      { key: 'perf_3y', label: 'Perf 3Y' },
      { key: 'perf_5y', label: 'Perf 5Y' },
      { key: 'perf_10y', label: 'Perf 10Y' },
      { key: 'volatility_w', label: 'Volatility (W)' },
      { key: 'volatility_m', label: 'Volatility (M)' },
    ],
  },
  {
    id: 'growth',
    title: 'รายได้และการเติบโต',
    icon: '🚀',
    rows: [
      { key: 'sales', label: 'Sales' },
      { key: 'sales_qq', label: 'Sales Q/Q' },
      { key: 'sales_yy_ttm', label: 'Sales Y/Y TTM' },
      { key: 'sales_past_35y', label: 'Sales Past 5Y/3Y' },
      { key: 'income', label: 'Income' },
      { key: 'eps_ttm', label: 'EPS (TTM)' },
      { key: 'eps_qq', label: 'EPS Q/Q' },
      { key: 'eps_yy_ttm', label: 'EPS Y/Y TTM' },
      { key: 'eps_past_35y', label: 'EPS Past 5Y/3Y' },
      { key: 'eps_next_y', label: 'EPS Next Y' },
    ],
  },
  {
    id: 'health',
    title: 'สุขภาพทางการเงิน',
    icon: '💪',
    rows: [
      { key: 'gross_margin', label: 'Gross Margin' },
      { key: 'oper_margin', label: 'Oper. Margin' },
      { key: 'profit_margin', label: 'Profit Margin' },
      { key: 'roa', label: 'ROA' },
      { key: 'roe', label: 'ROE' },
      { key: 'roic', label: 'ROIC' },
      { key: 'current_ratio', label: 'Current Ratio' },
      { key: 'quick_ratio', label: 'Quick Ratio' },
      { key: 'debt_eq', label: 'Debt/Eq' },
      { key: 'lt_debt_eq', label: 'LT Debt/Eq' },
      { key: 'book_sh', label: 'Book/sh' },
      { key: 'cash_sh', label: 'Cash/sh' },
    ],
  },
  {
    id: 'ownership',
    title: 'โครงสร้างผู้ถือหุ้น',
    icon: '🏛️',
    rows: [
      // Insider Trans / Inst Trans (period-over-period ownership *change*) are
      // deliberately absent: neither Finnhub nor yfinance publishes them, and inventing
      // or leaving a permanently-blank row is worse than not offering the row at all.
      { key: 'insider_own', label: 'Insider Own' },
      { key: 'inst_own', label: 'Inst Own' },
      { key: 'short_float', label: 'Short Float' },
      { key: 'short_ratio', label: 'Short Ratio' },
      { key: 'short_interest', label: 'Short Interest' },
      { key: 'shs_outstand', label: 'Shs Outstand' },
      { key: 'shs_float', label: 'Shs Float' },
    ],
  },
  {
    id: 'technical',
    title: 'ข้อมูลทางเทคนิค',
    icon: '⚡',
    rows: [
      { key: 'rsi14', label: 'RSI (14)' },
      { key: 'beta', label: 'Beta' },
      { key: 'atr14', label: 'ATR (14)' },
      { key: 'sma20', label: 'SMA20' },
      { key: 'sma50', label: 'SMA50' },
      { key: 'sma200', label: 'SMA200' },
      { key: 'week52_high', label: '52W High' },
      { key: 'week52_low', label: '52W Low' },
      { key: 'rel_volume', label: 'Rel Volume' },
      { key: 'avg_volume', label: 'Avg Volume' },
    ],
  },
  {
    id: 'dividend',
    title: 'เงินปันผล',
    icon: '💰',
    rows: [
      { key: 'dividend_ttm', label: 'Dividend TTM' },
      { key: 'dividend_est', label: 'Dividend Est' },
      { key: 'dividend_gr_35y', label: 'Div Growth 5Y/3Y' },
      { key: 'dividend_exdate', label: 'Div Ex-Date' },
      { key: 'payout', label: 'Payout' },
    ],
  },
  {
    id: 'analyst',
    title: 'ข้อมูลทั่วไปและนักวิเคราะห์',
    icon: '🎯',
    rows: [
      { key: 'earnings_date', label: 'Earnings Date' },
      { key: 'target_price', label: 'Target Price' },
      { key: 'recom', label: 'Recom (1-5)' },
      { key: 'employees', label: 'Employees' },
      { key: 'ipo', label: 'IPO' },
    ],
  },
];

// Colours a value only when it unambiguously carries a sign (a leading +/- percentage).
// Plain magnitudes like a P/E or a share count are left neutral -- "high" isn't inherently
// good or bad, and tinting them green/red would assert a judgement the data doesn't make.
function signedColor(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed.endsWith('%')) return undefined;
  const num = Number(trimmed.replace(/[%,]/g, ''));
  if (!Number.isFinite(num) || num === 0) return undefined;
  return num > 0 ? 'var(--green)' : 'var(--red)';
}

export function StockComparison() {
  const [stocks, setStocks] = useState<ComparableStock[]>([]);
  const [query, setQuery] = useState('');
  const [loadingSymbol, setLoadingSymbol] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isFull = stocks.length >= MAX_COMPARE_STOCKS;

  function handleAdd(symbol: string) {
    const key = symbol.trim().toUpperCase();
    if (!key || isFull) return;
    if (stocks.some((s) => s.symbol === key)) {
      setError(`${key} อยู่ในตารางเปรียบเทียบแล้ว`);
      return;
    }
    setError(null);
    setLoadingSymbol(key);
    getCompareStock(key)
      .then((stock) => {
        setStocks((prev) => (prev.length >= MAX_COMPARE_STOCKS ? prev : [...prev, stock]));
      })
      .catch(() => {
        setError(`ไม่พบข้อมูลเปรียบเทียบของ ${key}`);
      })
      .finally(() => setLoadingSymbol(null));
  }

  function handleRemove(symbol: string) {
    setStocks((prev) => prev.filter((s) => s.symbol !== symbol));
    setError(null);
  }

  return (
    <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>⚖️ เปรียบเทียบหุ้น (Stock Comparison)</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            เลือกได้สูงสุด {MAX_COMPARE_STOCKS} ตัว เพื่อเทียบข้อมูลพื้นฐานแบบเคียงข้างกัน
          </p>
        </div>
        <span className="badge badge-blue" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
          {stocks.length}/{MAX_COMPARE_STOCKS}
        </span>
      </div>

      {/* ── Add-a-stock picker ── */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <TickerAutocomplete
          id="compare-search-input"
          value={query}
          onChange={setQuery}
          onSelect={(item) => handleAdd(item.symbol)}
          clearOnSelect
          searchFn={(q) =>
            compareAutocomplete(q).then((items) =>
              items.map((i) => ({ symbol: i.symbol, company_name: i.name }))
            )
          }
          placeholder={isFull ? `เลือกครบ ${MAX_COMPARE_STOCKS} ตัวแล้ว` : 'ค้นหาหุ้นเพื่อเพิ่ม (เช่น AAPL, MSFT)'}
          className="glass-input"
          style={{ width: '100%', padding: '10px 14px' }}
          wrapperStyle={{ flexGrow: 1, minWidth: '260px', opacity: isFull ? 0.5 : 1, pointerEvents: isFull ? 'none' : 'auto' }}
        />
        {loadingSymbol && (
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>กำลังโหลด {loadingSymbol}…</span>
        )}
      </div>

      {/* Selected chips */}
      {stocks.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {stocks.map((s) => (
            <span
              key={s.symbol}
              className="badge badge-blue"
              style={{ fontSize: '0.82rem', padding: '5px 8px 5px 12px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              {s.symbol}
              <button
                type="button"
                onClick={() => handleRemove(s.symbol)}
                aria-label={`ลบ ${s.symbol}`}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  padding: '0 2px',
                  fontSize: '0.9rem',
                  lineHeight: 1,
                  boxShadow: 'none',
                }}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {error && <div role="alert">{error}</div>}

      {/* ── Comparison table ── */}
      {stocks.length === 0 ? (
        <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '10px' }}>⚖️</div>
          <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>ยังไม่ได้เลือกหุ้น</div>
          <div style={{ fontSize: '0.85rem' }}>
            ใช้ช่องค้นหาด้านบนเพื่อเพิ่มหุ้นที่ต้องการเปรียบเทียบ (สูงสุด {MAX_COMPARE_STOCKS} ตัว)
          </div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th
                  style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 2,
                    background: 'var(--panel3)',
                    textAlign: 'left',
                    minWidth: '160px',
                    padding: '12px 14px',
                    verticalAlign: 'bottom',
                  }}
                >
                  ตัวชี้วัด
                </th>
                {stocks.map((s) => (
                  // textTransform/letterSpacing reset: theme.css uppercases every <th> by
                  // default, which would mangle company names into "APPLE INC".
                  <th
                    key={s.symbol}
                    style={{
                      minWidth: '150px',
                      padding: '12px',
                      textAlign: 'center',
                      verticalAlign: 'bottom',
                      textTransform: 'none',
                      letterSpacing: 'normal',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      {s.logo_url ? (
                        <img
                          src={s.logo_url}
                          alt={s.symbol}
                          style={{ width: 42, height: 42, borderRadius: '10px', objectFit: 'contain', background: '#fff', padding: '3px' }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: '10px',
                            background: 'rgba(255,255,255,0.08)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                          }}
                        >
                          {s.symbol.charAt(0)}
                        </div>
                      )}
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--primary)' }}>{s.symbol}</span>
                      <span
                        style={{ fontSize: '0.72rem', color: 'var(--text-muted)', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={s.name}
                      >
                        {s.name}
                      </span>
                      {s.sector && (
                        <span className="badge badge-blue" style={{ fontSize: '0.65rem', padding: '1px 7px' }}>
                          {s.sector}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {SECTIONS.map((section) => (
              <tbody key={section.id}>
                <tr>
                  <td
                    colSpan={stocks.length + 1}
                    style={{
                      background: 'rgba(56, 189, 248, 0.08)',
                      borderTop: '1px solid var(--border)',
                      borderBottom: '1px solid var(--border)',
                      padding: '9px 14px',
                      fontWeight: 700,
                      color: 'var(--primary)',
                      fontSize: '0.82rem',
                    }}
                  >
                    {section.icon} {section.title}
                  </td>
                </tr>

                {section.rows.map((row) => (
                  <tr key={row.key}>
                    <th
                      scope="row"
                      style={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 1,
                        background: 'var(--panel3)',
                        textAlign: 'left',
                        fontWeight: 500,
                        color: 'var(--text-muted)',
                        textTransform: 'none',
                        letterSpacing: 'normal',
                        fontSize: '0.82rem',
                        padding: '9px 14px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.label}
                    </th>
                    {stocks.map((s) => {
                      const raw = s.metrics[row.key] ?? null;
                      return (
                        <td
                          key={s.symbol}
                          style={{
                            textAlign: 'center',
                            fontWeight: 700,
                            fontVariantNumeric: 'tabular-nums',
                            color: raw ? signedColor(raw) ?? 'var(--text)' : 'var(--text-dim)',
                            padding: '9px 12px',
                          }}
                        >
                          {raw ?? '-'}
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {/* Per-section generated summary. Rules are this codebase's own -- the
                    upstream API carries no summary text (see stockComparisonSummary.ts). */}
                {stocks.some((s) => buildComparisonSummary(s, section.id)) && (
                  <tr>
                    <th
                      scope="row"
                      style={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 1,
                        background: 'var(--panel3)',
                        textAlign: 'left',
                        fontWeight: 700,
                        color: 'var(--yellow)',
                        textTransform: 'none',
                        letterSpacing: 'normal',
                        fontSize: '0.8rem',
                        padding: '12px 14px',
                        verticalAlign: 'top',
                      }}
                    >
                      สรุป
                    </th>
                    {stocks.map((s) => (
                      <td
                        key={s.symbol}
                        style={{
                          padding: '12px',
                          fontSize: '0.78rem',
                          lineHeight: 1.55,
                          color: 'var(--text-muted)',
                          verticalAlign: 'top',
                          background: 'rgba(255,255,255,0.02)',
                        }}
                      >
                        {buildComparisonSummary(s, section.id) ?? '—'}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            ))}
          </table>
        </div>
      )}

      {stocks.length > 0 && (
        <p style={{ margin: 0, fontSize: '0.73rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
          ข้อมูลตัวเลขจาก Finnhub และ Yahoo Finance (yfinance) · RSI/ATR/SMA และผลตอบแทนหลายปี
          คำนวณจากราคาย้อนหลังจริง · ช่อง "สรุป" สร้างจากเกณฑ์ของแอปนี้เอง ไม่ใช่ของผู้ให้ข้อมูล ·
          ช่องที่ขึ้น "-" คือไม่มีข้อมูลจริงสำหรับหลักทรัพย์นั้น ไม่ใช่ค่าศูนย์
        </p>
      )}
    </div>
  );
}

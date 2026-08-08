import { describe, it, expect } from 'vitest';
import type { ComparableStock } from '../api/types';
import { buildComparisonSummary, parseMetricNumber } from './stockComparisonSummary';

function makeStock(overrides: Partial<ComparableStock> = {}): ComparableStock {
  return {
    symbol: 'AAPL',
    name: 'Apple Inc',
    sector: 'Technology',
    industry: 'Consumer Electronics',
    logo_url: null,
    price: 313.33,
    target_price: 327.82,
    analyst_target_upside_pct: 4.62,
    metrics: {},
    ...overrides,
  };
}

describe('parseMetricNumber', () => {
  it('reads the leading numeric token out of upstream-formatted strings', () => {
    expect(parseMetricNumber('35.43')).toBe(35.43);
    expect(parseMetricNumber('-7.24%')).toBe(-7.24);
    expect(parseMetricNumber('1,085.72%')).toBe(1085.72);
    // "52W High" arrives as "<price> <distance>" -- the leading price is the number.
    expect(parseMetricNumber('344.57 -10.35%')).toBe(344.57);
  });

  it('returns null for absent or non-numeric values rather than coercing to 0', () => {
    expect(parseMetricNumber(null)).toBeNull();
    expect(parseMetricNumber(undefined)).toBeNull();
    expect(parseMetricNumber('')).toBeNull();
    expect(parseMetricNumber('Yes / Yes')).toBeNull();
  });
});

describe('buildComparisonSummary', () => {
  it('returns null for a section with no measurable data instead of an empty verdict', () => {
    const etf = makeStock({ metrics: {} });
    expect(buildComparisonSummary(etf, 'valuation')).toBeNull();
    expect(buildComparisonSummary(etf, 'growth')).toBeNull();
    expect(buildComparisonSummary(etf, 'health')).toBeNull();
  });

  it('omits clauses for missing metrics rather than assuming a default', () => {
    // Only P/E present -- the sentence must not mention PEG or P/B at all.
    const stock = makeStock({ metrics: { pe_ratio: '35.43' } });
    const summary = buildComparisonSummary(stock, 'valuation');
    expect(summary).toContain('P/E 35.4');
    expect(summary).not.toContain('PEG');
    expect(summary).not.toContain('P/B');
  });

  it('flags a sub-1 PEG as cheap relative to growth', () => {
    const stock = makeStock({ metrics: { pe_ratio: '30.74', peg_ratio: '0.33' } });
    expect(buildComparisonSummary(stock, 'valuation')).toContain('ต่ำกว่า 1');
  });

  it('reports a loss-making company rather than printing a meaningless negative P/E band', () => {
    const stock = makeStock({ metrics: { pe_ratio: '-12.5' } });
    expect(buildComparisonSummary(stock, 'valuation')).toContain('ขาดทุน');
  });

  it('describes a negative year as a decline, not a rise', () => {
    const stock = makeStock({ metrics: { perf_year: '-18.20%', perf_ytd: '-4.10%' } });
    const summary = buildComparisonSummary(stock, 'performance');
    expect(summary).toContain('ติดลบ');
    expect(summary).toContain('ปรับลง 18.2%');
    expect(summary).not.toContain('ปรับขึ้น');
  });

  it('describes a positive year as a rise', () => {
    const stock = makeStock({ metrics: { perf_year: '48.82%', perf_ytd: '13.63%', perf_quarter: '13.84%' } });
    const summary = buildComparisonSummary(stock, 'performance');
    expect(summary).toContain('เป็นบวก');
    expect(summary).toContain('ปรับขึ้น 48.8%');
  });

  it('calls out shrinking revenue as contraction', () => {
    const stock = makeStock({ metrics: { sales_yy_ttm: '-9.30%', eps_yy_ttm: '-15.00%' } });
    const summary = buildComparisonSummary(stock, 'growth');
    expect(summary).toContain('หดตัว');
    expect(summary).not.toContain('เติบโตได้ดี');
  });

  it('flags high leverage as something to watch and low leverage as solid', () => {
    const levered = makeStock({ metrics: { profit_margin: '5.0', debt_eq: '3.10' } });
    expect(buildComparisonSummary(levered, 'health')).toContain('ควรติดตามภาระหนี้');

    const solid = makeStock({ metrics: { profit_margin: '62.97', debt_eq: '0.07' } });
    expect(buildComparisonSummary(solid, 'health')).toContain('ฐานะการเงินมั่นคง');
  });

  it('classifies RSI zones from the real value', () => {
    expect(buildComparisonSummary(makeStock({ metrics: { rsi14: '43.24' } }), 'technical')).toContain('โซนปกติ');
    expect(buildComparisonSummary(makeStock({ metrics: { rsi14: '78.0' } }), 'technical')).toContain('Overbought');
    expect(buildComparisonSummary(makeStock({ metrics: { rsi14: '22.0' } }), 'technical')).toContain('Oversold');
  });

  it('reads a price below its 200-day average as a downtrend', () => {
    const stock = makeStock({ metrics: { sma200: '-12.40%' } });
    const summary = buildComparisonSummary(stock, 'technical');
    expect(summary).toContain('ต่ำกว่าเส้นค่าเฉลี่ย 200 วัน');
    expect(summary).toContain('ขาลง');
  });

  it('states plainly when a stock pays no dividend, instead of implying missing data', () => {
    const stock = makeStock({ metrics: { dividend_ttm: '0', payout: '0.00%' } });
    expect(buildComparisonSummary(stock, 'dividend')).toContain('ยังไม่มีการจ่ายเงินปันผล');
  });

  it('omits the dividend section entirely when the fields are absent (e.g. an ETF)', () => {
    expect(buildComparisonSummary(makeStock({ metrics: {} }), 'dividend')).toBeNull();
  });

  it('renders the analyst view from real target price and upside', () => {
    const stock = makeStock({ metrics: { recom: '1.98' }, target_price: 327.82, analyst_target_upside_pct: 4.62 });
    const summary = buildComparisonSummary(stock, 'analyst');
    expect(summary).toContain('เชิงบวก');
    expect(summary).toContain('$327.82');
    expect(summary).toContain('4.6% (Upside)');
  });

  it('calls a target below the current price a downside, not an upside', () => {
    const stock = makeStock({ metrics: { recom: '3.80' }, target_price: 200, analyst_target_upside_pct: -20.5 });
    const summary = buildComparisonSummary(stock, 'analyst');
    expect(summary).toContain('เชิงลบ');
    expect(summary).toContain('20.5% (Downside)');
    expect(summary).not.toContain('(Upside)');
  });
});

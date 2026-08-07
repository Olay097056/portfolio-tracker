import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PositionSizingCalculator } from './PositionSizingCalculator';
import type { TradingSetup } from '../utils/aiTechnicalSignal';

const formatNumber = (n: number) => n.toFixed(2);

const setup: TradingSetup = {
  entryZone: { min: 218.0, max: 220.0, formatted: '' },
  targetPrice: { price: 250.0, upsidePct: 13.6, formatted: '' },
  stopLoss: { price: 200.0, downsidePct: 9.1, formatted: '' },
  riskRewardRatio: { ratio: 1.5, formatted: '' },
};

describe('PositionSizingCalculator', () => {
  it('shows an empty-state message when there are no portfolios', () => {
    render(<PositionSizingCalculator portfolios={[]} tradingSetup={setup} currencySymbol="$" multiplier={1} formatNumber={formatNumber} />);
    expect(screen.getByText(/ยังไม่มีพอร์ต/)).toBeInTheDocument();
  });

  it('computes shares from cash, risk %, and entry-minus-stop, defaulting to the first portfolio', () => {
    const portfolios = [
      { id: 1, name: 'Core', cash_usd: 10000, target_allocation_pct: null, created_at: '2026-01-01' },
      { id: 2, name: 'Growth', cash_usd: 5000, target_allocation_pct: null, created_at: '2026-01-01' },
    ];
    render(<PositionSizingCalculator portfolios={portfolios} tradingSetup={setup} currencySymbol="$" multiplier={1} formatNumber={formatNumber} />);

    // risk_amount = 10000 * 1% = 100; risk_per_share = 220 - 200 = 20; shares = floor(100/20) = 5
    expect(screen.getByText(/แนะนำซื้อ ~5 หุ้น/)).toBeInTheDocument();
  });

  it('recomputes when the user switches portfolios', () => {
    const portfolios = [
      { id: 1, name: 'Core', cash_usd: 10000, target_allocation_pct: null, created_at: '2026-01-01' },
      { id: 2, name: 'Growth', cash_usd: 5000, target_allocation_pct: null, created_at: '2026-01-01' },
    ];
    render(<PositionSizingCalculator portfolios={portfolios} tradingSetup={setup} currencySymbol="$" multiplier={1} formatNumber={formatNumber} />);

    fireEvent.change(screen.getByLabelText(/พอร์ต/), { target: { value: '2' } });

    // risk_amount = 5000 * 1% = 50; risk_per_share = 20; shares = floor(50/20) = 2
    expect(screen.getByText(/แนะนำซื้อ ~2 หุ้น/)).toBeInTheDocument();
  });

  it('recomputes when the user adjusts risk %', () => {
    const portfolios = [{ id: 1, name: 'Core', cash_usd: 10000, target_allocation_pct: null, created_at: '2026-01-01' }];
    render(<PositionSizingCalculator portfolios={portfolios} tradingSetup={setup} currencySymbol="$" multiplier={1} formatNumber={formatNumber} />);

    fireEvent.change(screen.getByLabelText(/เสี่ยงต่อครั้ง/), { target: { value: '2' } });

    // risk_amount = 10000 * 2% = 200; risk_per_share = 20; shares = floor(200/20) = 10
    expect(screen.getByText(/แนะนำซื้อ ~10 หุ้น/)).toBeInTheDocument();
  });

  it('shows a clear message instead of NaN/Infinity when stop-loss is not below entry', () => {
    const portfolios = [{ id: 1, name: 'Core', cash_usd: 10000, target_allocation_pct: null, created_at: '2026-01-01' }];
    const brokenSetup: TradingSetup = { ...setup, stopLoss: { price: 220.0, downsidePct: 0, formatted: '' } }; // stop == entry.max
    render(<PositionSizingCalculator portfolios={portfolios} tradingSetup={brokenSetup} currencySymbol="$" multiplier={1} formatNumber={formatNumber} />);

    expect(screen.getByText(/คำนวณไม่ได้/)).toBeInTheDocument();
    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument();
  });
});

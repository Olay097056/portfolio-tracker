// frontend/src/components/PortfolioDonutChart.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PortfolioDonutChart, HOLDING_COLORS } from './PortfolioDonutChart';
import type { HoldingStats } from '../api/types';

function makeHolding(overrides: Partial<HoldingStats>): HoldingStats {
  return {
    ticker: 'AAA',
    shares: 1,
    avg_cost_usd: 1,
    current_price: 1,
    value: 100,
    current_pct: 100,
    target_pct: null,
    deviation_pp: null,
    severity: null,
    unrealized_pnl: 0,
    realized_pnl: 0,
    ...overrides,
  };
}

describe('PortfolioDonutChart', () => {
  it('renders one legend row per holding, in order, matching tickers', () => {
    const holdings = [makeHolding({ ticker: 'JEPQ', value: 750 }), makeHolding({ ticker: 'SMH', value: 250 })];
    render(<PortfolioDonutChart holdings={holdings} totalValue={1000} pnlValue={50} pnlPct={5} />);

    const list = screen.getByRole('list', { name: 'Holdings legend' });
    const items = list.querySelectorAll('[role="listitem"]');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('JEPQ');
    expect(items[1].textContent).toContain('SMH');
  });

  it('draws arc lengths proportional to each holding\'s share of value', () => {
    const holdings = [makeHolding({ ticker: 'JEPQ', value: 750 }), makeHolding({ ticker: 'SMH', value: 250 })];
    const { container } = render(<PortfolioDonutChart holdings={holdings} totalValue={1000} pnlValue={50} pnlPct={5} size={120} />);

    const circles = container.querySelectorAll('circle');
    expect(circles).toHaveLength(2);

    const radius = (120 - 16) / 2;
    const circumference = 2 * Math.PI * radius;

    const firstDash = Number(circles[0].getAttribute('stroke-dasharray')!.split(' ')[0]);
    const secondDash = Number(circles[1].getAttribute('stroke-dasharray')!.split(' ')[0]);

    expect(firstDash).toBeCloseTo(circumference * 0.75, 1);
    expect(secondDash).toBeCloseTo(circumference * 0.25, 1);

    // Second segment starts exactly where the first one ends.
    expect(Number(circles[1].getAttribute('stroke-dashoffset'))).toBeCloseTo(-firstDash, 1);
  });

  it('cycles the 8-color palette when there are more than 8 holdings', () => {
    const holdings = Array.from({ length: 9 }, (_, i) => makeHolding({ ticker: `T${i}`, value: 100 }));
    const { container } = render(<PortfolioDonutChart holdings={holdings} totalValue={900} pnlValue={0} pnlPct={0} />);

    const circles = container.querySelectorAll('circle');
    expect(circles).toHaveLength(9);
    // Holding index 8 wraps back around to color index 0.
    expect(circles[8].getAttribute('stroke')).toBe(HOLDING_COLORS[0]);
    expect(circles[0].getAttribute('stroke')).toBe(HOLDING_COLORS[0]);
  });

  it('renders a flat gray ring with no legend when there are no holdings', () => {
    render(<PortfolioDonutChart holdings={[]} totalValue={0} pnlValue={0} pnlPct={0} />);

    expect(screen.getByTestId('donut-empty-ring')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Holdings legend' })).not.toBeInTheDocument();
  });

  it('shows the total value centered, formatted with the given currency symbol', () => {
    render(<PortfolioDonutChart holdings={[makeHolding({})]} totalValue={1234.5} pnlValue={12} pnlPct={1} currencySymbol="฿" />);
    expect(screen.getByText('฿1,234.5')).toBeInTheDocument();
  });
});

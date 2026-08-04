import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HoldingRow } from './HoldingRow';

const holding = {
  id: 1,
  portfolio_id: 1,
  ticker: 'AAPL',
  shares: 12,
  avg_cost_usd: 187.4,
  target_allocation_pct: 20,
  realized_pnl_usd: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('HoldingRow', () => {
  it('renders ticker, shares, and average cost', () => {
    render(<HoldingRow holding={holding} onDelete={vi.fn()} />);

    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText(/12/)).toBeInTheDocument();
    expect(screen.getByText(/187.4/)).toBeInTheDocument();
  });

  it('calls onDelete with the holding id when delete is clicked', () => {
    const onDelete = vi.fn();
    render(<HoldingRow holding={holding} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it('renders current price, value, and a severity indicator when stats are provided', () => {
    render(
      <HoldingRow
        holding={holding}
        onDelete={vi.fn()}
        stats={{
          ticker: 'AAPL',
          shares: 12,
          avg_cost_usd: 187.4,
          current_price: 333.74,
          value: 4004.88,
          current_pct: 41.1,
          target_pct: 20,
          deviation_pp: 21.1,
          severity: 'red',
          unrealized_pnl: 1755.28,
          realized_pnl: 0,
        }}
      />,
    );

    expect(screen.getByText(/333.74/)).toBeInTheDocument();
    expect(screen.getByText(/4,004.88/)).toBeInTheDocument();
    expect(screen.getByTestId('severity-indicator')).toHaveAttribute('data-severity', 'red');
    expect(screen.getByTestId('severity-indicator')).toHaveStyle({ backgroundColor: 'var(--red)' });
  });

  it.each([
    ['green', 'var(--green)'],
    ['yellow', 'var(--yellow)'],
    ['red', 'var(--red)'],
  ] as const)('colors the severity indicator %s to match the theme token', (severity, expectedColor) => {
    render(
      <HoldingRow
        holding={holding}
        onDelete={vi.fn()}
        stats={{
          ticker: 'AAPL',
          shares: 12,
          avg_cost_usd: 187.4,
          current_price: 333.74,
          value: 4004.88,
          current_pct: 41.1,
          target_pct: 20,
          deviation_pp: 21.1,
          severity,
          unrealized_pnl: 1755.28,
          realized_pnl: 0,
        }}
      />,
    );

    expect(screen.getByTestId('severity-indicator')).toHaveStyle({ backgroundColor: expectedColor });
  });

  it('renders no severity color (never a fabricated one) when severity is null', () => {
    render(
      <HoldingRow
        holding={holding}
        onDelete={vi.fn()}
        stats={{
          ticker: 'AAPL',
          shares: 12,
          avg_cost_usd: 187.4,
          current_price: 333.74,
          value: 4004.88,
          current_pct: 41.1,
          target_pct: 20,
          deviation_pp: 21.1,
          severity: null,
          unrealized_pnl: 1755.28,
          realized_pnl: 0,
        }}
      />,
    );

    expect(screen.getByTestId('severity-indicator')).toHaveAttribute('data-severity', 'none');
    // jsdom normalizes the literal 'transparent' keyword to this rgba equivalent.
    expect(screen.getByTestId('severity-indicator')).toHaveStyle({ backgroundColor: 'rgba(0, 0, 0, 0)' });
  });

  it('styles the delete button as a warning action, matching the Dashboard\'s Recompute-defaults convention', () => {
    render(<HoldingRow holding={holding} onDelete={vi.fn()} />);

    expect(screen.getByRole('button', { name: /delete/i })).toHaveStyle({ color: 'var(--red)' });
  });

  it('renders without price/value when stats are not provided', () => {
    render(<HoldingRow holding={holding} onDelete={vi.fn()} />);

    expect(screen.queryByTestId('severity-indicator')).not.toBeInTheDocument();
  });

  const statsWithPrice = {
    ticker: 'AAPL',
    shares: 12,
    avg_cost_usd: 187.4,
    current_price: 333.74,
    value: 4004.88,
    current_pct: 41.1,
    target_pct: 20,
    deviation_pp: 21.1,
    severity: 'red' as const,
    unrealized_pnl: 1755.28,
    realized_pnl: 0,
  };

  it('shows a "Calculate" toggle when stats (and thus a current price) are available', () => {
    render(<HoldingRow holding={holding} onDelete={vi.fn()} stats={statsWithPrice} />);

    expect(screen.getByRole('button', { name: /calculate/i })).toBeInTheDocument();
  });

  it('does not show a "Calculate" toggle when stats are unavailable', () => {
    render(<HoldingRow holding={holding} onDelete={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /calculate/i })).not.toBeInTheDocument();
  });

  it('clicking "Calculate" reveals both the DCA and stress-test calculators', () => {
    render(<HoldingRow holding={holding} onDelete={vi.fn()} stats={statsWithPrice} />);

    fireEvent.click(screen.getByRole('button', { name: /calculate/i }));

    expect(screen.getByText(/dca calculator/i)).toBeInTheDocument();
    expect(screen.getByText(/stress test/i)).toBeInTheDocument();
  });
});

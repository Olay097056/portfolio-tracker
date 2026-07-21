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
  });

  it('renders without price/value when stats are not provided', () => {
    render(<HoldingRow holding={holding} onDelete={vi.fn()} />);

    expect(screen.queryByTestId('severity-indicator')).not.toBeInTheDocument();
  });
});

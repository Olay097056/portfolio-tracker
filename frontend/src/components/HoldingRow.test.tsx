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
});

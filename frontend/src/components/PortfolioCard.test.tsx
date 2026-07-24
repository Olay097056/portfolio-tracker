import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { PortfolioCard } from './PortfolioCard';

const portfolio = { id: 1, name: 'DIME', cash_usd: 250, target_allocation_pct: 70, created_at: '2026-01-01T00:00:00Z' };

describe('PortfolioCard', () => {
  beforeEach(() => {
    vi.spyOn(client, 'getPortfolioSummary').mockResolvedValue({
      id: portfolio.id,
      name: portfolio.name,
      cash_usd: portfolio.cash_usd,
      target_allocation_pct: portfolio.target_allocation_pct,
      holdings_value: 0,
      total_value: portfolio.cash_usd,
      unrealized_pnl: 0,
      realized_pnl: 0,
      holdings: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the portfolio name, total value, and target allocation', async () => {
    render(<PortfolioCard portfolio={portfolio} onDelete={vi.fn()} onToggleHoldings={vi.fn()} expanded={false} />);

    await waitFor(() => expect(screen.getByText('DIME')).toBeInTheDocument());
    expect(screen.getByText(/250/)).toBeInTheDocument();
    expect(screen.getByText(/70/)).toBeInTheDocument();
  });

  it('renders "no target set" when target_allocation_pct is null', async () => {
    render(<PortfolioCard portfolio={{ ...portfolio, target_allocation_pct: null }} onDelete={vi.fn()} onToggleHoldings={vi.fn()} expanded={false} />);

    await waitFor(() => expect(screen.getByText(/no target set/i)).toBeInTheDocument());
  });

  it('calls onDelete with the portfolio id when the delete button is clicked', async () => {
    const onDelete = vi.fn();
    render(<PortfolioCard portfolio={portfolio} onDelete={onDelete} onToggleHoldings={vi.fn()} expanded={false} />);

    await waitFor(() => expect(screen.getByText('DIME')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it('calls onToggleHoldings with the portfolio id when the "show holdings" button is clicked', async () => {
    const onToggleHoldings = vi.fn();
    render(<PortfolioCard portfolio={portfolio} onDelete={vi.fn()} onToggleHoldings={onToggleHoldings} expanded={false} />);

    await waitFor(() => expect(screen.getByText('DIME')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /show holdings/i }));

    expect(onToggleHoldings).toHaveBeenCalledWith(1);
  });

  it('shows "hide holdings" label when expanded is true', async () => {
    render(<PortfolioCard portfolio={portfolio} onDelete={vi.fn()} onToggleHoldings={vi.fn()} expanded={true} />);

    await waitFor(() => expect(screen.getByRole('button', { name: /hide holdings/i })).toBeInTheDocument());
  });

  it('shows the real total value from the summary once loaded', async () => {
    vi.spyOn(client, 'getPortfolioSummary').mockResolvedValue({
      id: 1,
      name: 'DIME',
      cash_usd: 250,
      target_allocation_pct: 70,
      holdings_value: 4004.88,
      total_value: 4254.88,
      unrealized_pnl: 1755.28,
      realized_pnl: 0,
      holdings: [],
    });

    render(<PortfolioCard portfolio={portfolio} onDelete={vi.fn()} onToggleHoldings={vi.fn()} expanded={false} />);

    await waitFor(() => expect(screen.getByText(/4,254.88/)).toBeInTheDocument());
  });

  it('shows a rebalance-needed count when some holdings are yellow/red', async () => {
    vi.spyOn(client, 'getPortfolioSummary').mockResolvedValue({
      id: 1,
      name: 'DIME',
      cash_usd: 0,
      target_allocation_pct: 70,
      holdings_value: 1000,
      total_value: 1000,
      unrealized_pnl: 0,
      realized_pnl: 0,
      holdings: [
        { ticker: 'AAPL', shares: 1, avg_cost_usd: 100, current_price: 100, value: 500, current_pct: 50, target_pct: 20, deviation_pp: 30, severity: 'red', unrealized_pnl: 0, realized_pnl: 0 },
        { ticker: 'SMH', shares: 1, avg_cost_usd: 100, current_price: 100, value: 500, current_pct: 50, target_pct: 50, deviation_pp: 0, severity: 'green', unrealized_pnl: 0, realized_pnl: 0 },
      ],
    });

    render(<PortfolioCard portfolio={portfolio} onDelete={vi.fn()} onToggleHoldings={vi.fn()} expanded={false} />);

    await waitFor(() => expect(screen.getByText(/1 holding needs rebalancing/i)).toBeInTheDocument());
  });

  it('does not show a rebalance-needed message when all holdings are green', async () => {
    vi.spyOn(client, 'getPortfolioSummary').mockResolvedValue({
      id: 1,
      name: 'DIME',
      cash_usd: 0,
      target_allocation_pct: 70,
      holdings_value: 500,
      total_value: 500,
      unrealized_pnl: 0,
      realized_pnl: 0,
      holdings: [
        { ticker: 'AAPL', shares: 1, avg_cost_usd: 100, current_price: 100, value: 500, current_pct: 100, target_pct: 100, deviation_pp: 0, severity: 'green', unrealized_pnl: 0, realized_pnl: 0 },
      ],
    });

    render(<PortfolioCard portfolio={portfolio} onDelete={vi.fn()} onToggleHoldings={vi.fn()} expanded={false} />);

    await waitFor(() => expect(screen.getByText(/500/)).toBeInTheDocument());
    expect(screen.queryByText(/needs? rebalancing/i)).not.toBeInTheDocument();
  });
});

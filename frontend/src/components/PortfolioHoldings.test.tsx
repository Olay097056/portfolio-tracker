import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { PortfolioHoldings } from './PortfolioHoldings';

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

describe('PortfolioHoldings', () => {
  beforeEach(() => {
    // Default mock so tests that don't care about pricing never hit a real
    // fetch() via usePortfolioSummary — tests that DO care override this
    // with their own vi.spyOn(client, 'getPortfolioSummary') call below.
    vi.spyOn(client, 'getPortfolioSummary').mockResolvedValue({
      id: 1,
      name: 'DIME',
      cash_usd: 0,
      target_allocation_pct: null,
      holdings_value: 0,
      total_value: 0,
      unrealized_pnl: 0,
      realized_pnl: 0,
      holdings: [],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a loading state, then renders fetched holdings for the given portfolio', async () => {
    vi.spyOn(client, 'listHoldings').mockResolvedValue([holding]);

    render(<PortfolioHoldings portfolioId={1} />);

    expect(screen.getByText(/loading holdings/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('AAPL')).toBeInTheDocument());
    expect(client.listHoldings).toHaveBeenCalledWith(1);
  });

  it('shows an empty state when the portfolio has no holdings', async () => {
    vi.spyOn(client, 'listHoldings').mockResolvedValue([]);

    render(<PortfolioHoldings portfolioId={1} />);

    await waitFor(() => expect(screen.getByText(/no holdings yet/i)).toBeInTheDocument());
  });

  it('submitting the add-holding form creates a holding under this portfolio', async () => {
    vi.spyOn(client, 'listHoldings').mockResolvedValueOnce([]).mockResolvedValueOnce([holding]);
    vi.spyOn(client, 'createHolding').mockResolvedValue(holding);

    render(<PortfolioHoldings portfolioId={1} />);
    await waitFor(() => expect(screen.getByText(/no holdings yet/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    fireEvent.change(screen.getByLabelText(/shares/i), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(/average cost/i), { target: { value: '187.4' } });
    fireEvent.click(screen.getByRole('button', { name: /add holding/i }));

    await waitFor(() => expect(screen.getByText('AAPL')).toBeInTheDocument());
    expect(client.createHolding).toHaveBeenCalledWith(1, { ticker: 'AAPL', shares: 12, avg_cost_usd: 187.4 });
  });

  it('clicking delete on a holding removes it from the list', async () => {
    vi.spyOn(client, 'listHoldings').mockResolvedValueOnce([holding]).mockResolvedValueOnce([]);
    vi.spyOn(client, 'deleteHolding').mockResolvedValue(undefined);

    render(<PortfolioHoldings portfolioId={1} />);
    await waitFor(() => expect(screen.getByText('AAPL')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(screen.getByText(/no holdings yet/i)).toBeInTheDocument());
  });

  it('shows an inline error banner on a failed create', async () => {
    vi.spyOn(client, 'listHoldings').mockResolvedValue([]);
    vi.spyOn(client, 'createHolding').mockRejectedValue(new client.ApiError(400, 'Holding target allocations would exceed 100%'));

    render(<PortfolioHoldings portfolioId={1} />);
    await waitFor(() => expect(screen.getByText(/no holdings yet/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    fireEvent.change(screen.getByLabelText(/shares/i), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(/average cost/i), { target: { value: '187.4' } });
    fireEvent.click(screen.getByRole('button', { name: /add holding/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Holding target allocations would exceed 100%'));
  });

  it('matches each holding to its stats by ticker and passes them to HoldingRow', async () => {
    vi.spyOn(client, 'listHoldings').mockResolvedValue([holding]);
    vi.spyOn(client, 'getPortfolioSummary').mockResolvedValue({
      id: 1,
      name: 'DIME',
      cash_usd: 0,
      target_allocation_pct: null,
      holdings_value: 4004.88,
      total_value: 4004.88,
      unrealized_pnl: 1755.28,
      realized_pnl: 0,
      holdings: [
        {
          ticker: 'AAPL',
          shares: 12,
          avg_cost_usd: 187.4,
          current_price: 333.74,
          value: 4004.88,
          current_pct: 100,
          target_pct: 20,
          deviation_pp: 80,
          severity: 'red',
          unrealized_pnl: 1755.28,
          realized_pnl: 0,
        },
      ],
    });

    render(<PortfolioHoldings portfolioId={1} />);

    await waitFor(() => expect(screen.getByText(/333.74/)).toBeInTheDocument());
  });

  it('renders a holding with no matching summary entry gracefully (no price shown, no crash)', async () => {
    vi.spyOn(client, 'listHoldings').mockResolvedValue([holding]);
    vi.spyOn(client, 'getPortfolioSummary').mockResolvedValue({
      id: 1,
      name: 'DIME',
      cash_usd: 0,
      target_allocation_pct: null,
      holdings_value: 0,
      total_value: 0,
      unrealized_pnl: 0,
      realized_pnl: 0,
      holdings: [],
    });

    render(<PortfolioHoldings portfolioId={1} />);

    await waitFor(() => expect(screen.getByText('AAPL')).toBeInTheDocument());
    expect(screen.queryByTestId('severity-indicator')).not.toBeInTheDocument();
  });
});

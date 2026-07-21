import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    vi.spyOn(client, 'createHolding').mockRejectedValue(new client.ApiError(400, 'Holding Target allocations would exceed 100%'));

    render(<PortfolioHoldings portfolioId={1} />);
    await waitFor(() => expect(screen.getByText(/no holdings yet/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    fireEvent.change(screen.getByLabelText(/shares/i), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(/average cost/i), { target: { value: '187.4' } });
    fireEvent.click(screen.getByRole('button', { name: /add holding/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Target allocations would exceed 100%'));
  });
});

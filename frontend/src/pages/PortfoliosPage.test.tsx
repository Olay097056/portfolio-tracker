import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { PortfoliosPage } from './PortfoliosPage';

const portfolio = { id: 1, name: 'DIME', cash_usd: 250, target_allocation_pct: 70, created_at: '2026-01-01T00:00:00Z' };

describe('PortfoliosPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a loading state, then renders fetched portfolios', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([portfolio]);

    render(<PortfoliosPage />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('DIME')).toBeInTheDocument());
  });

  it('shows an empty state when there are no portfolios', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);

    render(<PortfoliosPage />);

    await waitFor(() => expect(screen.getByText(/no portfolios yet/i)).toBeInTheDocument());
  });

  it('submitting the add-portfolio form creates a portfolio and shows it in the list', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValueOnce([]).mockResolvedValueOnce([portfolio]);
    vi.spyOn(client, 'createPortfolio').mockResolvedValue(portfolio);

    render(<PortfoliosPage />);
    await waitFor(() => expect(screen.getByText(/no portfolios yet/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'DIME' } });
    fireEvent.click(screen.getByRole('button', { name: /add portfolio/i }));

    await waitFor(() => expect(screen.getByText('DIME')).toBeInTheDocument());
    expect(client.createPortfolio).toHaveBeenCalledWith({ name: 'DIME', cash_usd: 0 });
  });

  it('clicking delete on a portfolio card removes it from the list', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValueOnce([portfolio]).mockResolvedValueOnce([]);
    vi.spyOn(client, 'deletePortfolio').mockResolvedValue(undefined);

    render(<PortfoliosPage />);
    await waitFor(() => expect(screen.getByText('DIME')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(screen.getByText(/no portfolios yet/i)).toBeInTheDocument());
  });

  it('shows an inline error banner on a failed create, while keeping the form and list visible', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([portfolio]);
    vi.spyOn(client, 'createPortfolio').mockRejectedValue(new client.ApiError(400, 'Target allocations would exceed 100%'));

    render(<PortfoliosPage />);
    await waitFor(() => expect(screen.getByText('DIME')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Speculative' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add portfolio/i }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Target allocations would exceed 100%');
    // the existing portfolio and the form itself must still be visible/usable:
    expect(screen.getByText('DIME')).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from './api/client';
import { App } from './App';

describe('App', () => {
  beforeEach(() => {
    vi.spyOn(client, 'getPortfolioSummary').mockResolvedValue({
      id: 1,
      name: '',
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

  it('renders the app title and the portfolios page by default', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Portfolio Tracker' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/no portfolios yet/i)).toBeInTheDocument());
  });

  it('switches to the Tools tab and back without losing the Portfolios tab content', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);

    render(<App />);
    await waitFor(() => expect(screen.getByText(/no portfolios yet/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Tools' }));

    expect(screen.getByRole('heading', { name: 'Tools' })).toBeInTheDocument();
    expect(screen.queryByText(/no portfolios yet/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Portfolios' }));

    await waitFor(() => expect(screen.getByText(/no portfolios yet/i)).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Tools' })).not.toBeInTheDocument();
  });

  it('switches to the Watchlist tab and shows its content', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<App />);
    await waitFor(() => expect(screen.getByText(/no portfolios yet/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Watchlist' }));

    expect(screen.getByRole('heading', { name: 'Watchlist' })).toBeInTheDocument();
    expect(screen.queryByText(/no portfolios yet/i)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());
  });

  it('switches to the Dashboard tab and shows its content', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<App />);
    await waitFor(() => expect(screen.getByText(/no portfolios yet/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/no tickers to chart/i)).toBeInTheDocument());
  });

  it('positions the Dashboard tab ahead of the Portfolios tab', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);

    render(<App />);
    await waitFor(() => expect(screen.getByText(/no portfolios yet/i)).toBeInTheDocument());

    const tabLabels = screen.getAllByRole('button').map((button) => button.textContent);
    expect(tabLabels.indexOf('Dashboard')).toBeGreaterThanOrEqual(0);
    expect(tabLabels.indexOf('Dashboard')).toBeLessThan(tabLabels.indexOf('Portfolios'));
  });

  it('switches to the Bond-crisis tab and shows the macro dashboard', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'getMacroDashboard').mockRejectedValue(new Error('offline in test'));

    render(<App />);
    await waitFor(() => expect(screen.getByText(/no portfolios yet/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Bond-crisis' }));

    expect(screen.getByRole('heading', { name: /Bond-crisis/ })).toBeInTheDocument();
    expect(screen.queryByText(/no portfolios yet/i)).not.toBeInTheDocument();
    // The macro dashboard mounts inside the tab (its offline retry state shows).
    await waitFor(() => expect(screen.getByText(/โหลดข้อมูลไม่สำเร็จ/)).toBeInTheDocument());
  });
});

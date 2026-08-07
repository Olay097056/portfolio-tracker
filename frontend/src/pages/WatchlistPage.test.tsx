import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { WatchlistPage } from './WatchlistPage';

describe('WatchlistPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the Manage Watchlist sub-tab content by default', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<WatchlistPage />);

    expect(screen.getByRole('heading', { name: 'Watchlist' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Manage Watchlist' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());
  });

  it('switches to the Dividend Ranking sub-tab and shows its content', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<WatchlistPage />);
    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Dividend Ranking' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dividend Ranking' })).toBeInTheDocument());
  });

  it('keeps Dividend Ranking results and the entered tax rate after switching away and back, with no re-scan', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'JEPQ', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'getDividendSignal').mockResolvedValue({
      ticker: 'JEPQ',
      price: 58.51,
      gross_yield_pct: 10.0,
      payment_frequency: 12,
      dividend_growth_pct: 3.2,
    });

    render(<WatchlistPage />);
    await waitFor(() => expect(screen.getByText('JEPQ')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Dividend Ranking' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/tax rate/i), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));
    await waitFor(() => expect(screen.getByText('7.00%')).toBeInTheDocument()); // 10 * (1 - 30/100)
    expect(client.getDividendSignal).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Manage Watchlist' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dividend Ranking' }));

    await waitFor(() => expect(screen.getByLabelText(/tax rate/i)).toHaveValue(30));
    expect(screen.getByText('7.00%')).toBeInTheDocument();
    expect(client.getDividendSignal).toHaveBeenCalledTimes(1);
  });

  it('switches to the Trending Stocks Today sub-tab and shows its content', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<WatchlistPage />);
    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Trending Stocks Today' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Trending Stocks Today' })).toBeInTheDocument());
  });

  it('keeps Trending Stocks Today data after switching away and back, with no re-fetch', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);
    vi.spyOn(client, 'getTrending').mockResolvedValue({
      gainers: [{ ticker: 'AAPL', name: 'Apple Inc.', price: 195.5, change_pct: 4.2 }],
      losers: [],
      most_active: [],
      api_key_configured: true,
    });

    render(<WatchlistPage />);
    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Trending Stocks Today' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^refresh$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }));
    await waitFor(() => expect(screen.getByText('AAPL')).toBeInTheDocument());
    expect(client.getTrending).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Manage Watchlist' }));
    fireEvent.click(screen.getByRole('button', { name: 'Trending Stocks Today' }));

    await waitFor(() => expect(screen.getByText('AAPL')).toBeInTheDocument());
    expect(client.getTrending).toHaveBeenCalledTimes(1);
  });
});

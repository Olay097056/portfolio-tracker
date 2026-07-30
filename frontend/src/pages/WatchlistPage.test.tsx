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

  it('switches to the Momentum Scanner sub-tab and shows its content', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<WatchlistPage />);
    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Momentum Scanner' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Momentum Scanner' })).toBeInTheDocument());
  });

  it('keeps Momentum Scanner results and their scanned-period heading after switching away and back, with no re-scan', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'VTI', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'getPriceSignal').mockResolvedValue({
      ticker: 'VTI',
      percent_change_pct: 1.5,
      rsi_14: null,
      volume_ratio: null,
      distance_from_sma50_pct: null,
      bb_width_pct: null,
      bb_width_percentile: null,
      atr_pct: null,
    });

    render(<WatchlistPage />);
    await waitFor(() => expect(screen.getByText('VTI')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Momentum Scanner' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/period/i), { target: { value: '1m' } });
    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));
    await waitFor(() => expect(screen.getByText('% change (1m)')).toBeInTheDocument());
    expect(client.getPriceSignal).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Manage Watchlist' }));
    fireEvent.click(screen.getByRole('button', { name: 'Momentum Scanner' }));

    // MomentumScanner remounts on tab switch (its own useWatchlist instance re-fetches), so it
    // passes through a fresh loading state before its content — including the period selector —
    // renders again.
    await waitFor(() => expect(screen.getByLabelText(/period/i)).toBeInTheDocument());

    // The period selector resets to its own default on remount, but the heading must keep
    // reporting the period the still-displayed results were actually scanned with.
    expect(screen.getByLabelText(/period/i)).toHaveValue('1w');
    expect(screen.getByText('% change (1m)')).toBeInTheDocument();
    expect(screen.getByText('1.50%')).toBeInTheDocument();
    expect(client.getPriceSignal).toHaveBeenCalledTimes(1);
  });

  it('switches to the Pre-Squeeze Scanner sub-tab and shows its content', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<WatchlistPage />);
    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Pre-Squeeze Scanner' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Pre-Squeeze Scanner' })).toBeInTheDocument());
  });

  it('scanning on Momentum Scanner populates Pre-Squeeze Scanner too, with no second request', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'VTI', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'getPriceSignal').mockResolvedValue({
      ticker: 'VTI',
      percent_change_pct: 1.5,
      rsi_14: 60,
      volume_ratio: 1.2,
      distance_from_sma50_pct: 2,
      bb_width_pct: 4.2,
      bb_width_percentile: 12.5,
      atr_pct: 3.1,
    });

    render(<WatchlistPage />);
    await waitFor(() => expect(screen.getByText('VTI')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Momentum Scanner' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));
    await waitFor(() => expect(screen.getByText('VTI')).toBeInTheDocument());
    expect(client.getPriceSignal).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Pre-Squeeze Scanner' }));

    await waitFor(() => expect(screen.getByText('12.50')).toBeInTheDocument());
    expect(client.getPriceSignal).toHaveBeenCalledTimes(1);
  });

  it('keeps the Momentum Scanner heading truthful even when Pre-Squeeze Scanner scans first', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'VTI', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'getPriceSignal').mockResolvedValue({
      ticker: 'VTI',
      percent_change_pct: 1.5,
      rsi_14: 60,
      volume_ratio: 1.2,
      distance_from_sma50_pct: 2,
      bb_width_pct: 4.2,
      bb_width_percentile: 12.5,
      atr_pct: 3.1,
    });

    render(<WatchlistPage />);
    await waitFor(() => expect(screen.getByText('VTI')).toBeInTheDocument());

    // Scan from Pre-Squeeze first — it has no period selector, so this scan is period-agnostic.
    fireEvent.click(screen.getByRole('button', { name: 'Pre-Squeeze Scanner' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));
    await waitFor(() => expect(screen.getByText('12.50')).toBeInTheDocument());
    expect(client.getPriceSignal).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Momentum Scanner' }));
    await waitFor(() => expect(screen.getByText('% change (1w)')).toBeInTheDocument());

    // Changing the selector without rescanning must not relabel data that came from the
    // Pre-Squeeze-triggered scan, even though Momentum itself never explicitly requested a period.
    fireEvent.change(screen.getByLabelText(/period/i), { target: { value: '1m' } });

    expect(screen.getByText('% change (1w)')).toBeInTheDocument();
    expect(screen.queryByText('% change (1m)')).not.toBeInTheDocument();
    expect(client.getPriceSignal).toHaveBeenCalledTimes(1);
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

    // Unlike MomentumScanner/PreSqueezeScanner (which own a fresh useWatchlist instance and pass
    // through a loading state on every remount), DividendRanking's scan state and tax rate are
    // both owned by WatchlistPage, so nothing here should reset.
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

    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(client.getTrending).toHaveBeenCalledTimes(1);
  });
});

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
    vi.spyOn(client, 'getPriceSignal').mockResolvedValue({ ticker: 'VTI', percent_change_pct: 1.5 });

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
});

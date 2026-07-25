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
});

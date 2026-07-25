import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { WatchlistManagementPage } from './WatchlistManagementPage';

const item = { id: 1, ticker: 'VTI', category: 'Core', created_at: '2026-01-01T00:00:00Z' };

describe('WatchlistManagementPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a loading state, then renders fetched items', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([item]);

    render(<WatchlistManagementPage />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('VTI')).toBeInTheDocument());
  });

  it('renders a heading matching its tab label, following the pattern every Tools sub-tab uses', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<WatchlistManagementPage />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Manage Watchlist' })).toBeInTheDocument());
  });

  it('shows an empty state when the watchlist has no items', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<WatchlistManagementPage />);

    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());
  });

  it('submitting the add form creates an item and shows it in the list', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValueOnce([]).mockResolvedValueOnce([item]);
    vi.spyOn(client, 'createWatchlistItem').mockResolvedValue(item);

    render(<WatchlistManagementPage />);
    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'vti' } });
    fireEvent.click(screen.getByRole('button', { name: /add to watchlist/i }));

    await waitFor(() => expect(screen.getByText('VTI')).toBeInTheDocument());
    expect(client.createWatchlistItem).toHaveBeenCalledWith({ ticker: 'VTI', category: null });
  });

  it('clicking Remove on an item removes it from the list', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValueOnce([item]).mockResolvedValueOnce([]);
    vi.spyOn(client, 'deleteWatchlistItem').mockResolvedValue(undefined);

    render(<WatchlistManagementPage />);
    await waitFor(() => expect(screen.getByText('VTI')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /remove/i }));

    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());
  });

  it('shows an inline error banner on a failed create, while keeping the form and list visible', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([item]);
    vi.spyOn(client, 'createWatchlistItem').mockRejectedValue(new client.ApiError(400, 'Ticker already on watchlist'));

    render(<WatchlistManagementPage />);
    await waitFor(() => expect(screen.getByText('VTI')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'IOVA' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add to watchlist/i }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Ticker already on watchlist');
    expect(screen.getByText('VTI')).toBeInTheDocument();
    expect(screen.getByLabelText('Ticker')).toBeInTheDocument();
  });
});

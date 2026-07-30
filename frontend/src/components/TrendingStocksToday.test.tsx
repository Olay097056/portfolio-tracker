import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { useTrendingData } from '../hooks/useTrendingData';
import { TrendingStocksToday } from './TrendingStocksToday';

function Wrapper() {
  const scanState = useTrendingData();
  return <TrendingStocksToday scanState={scanState} />;
}

describe('TrendingStocksToday', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a Refresh button and issues no request until it is pressed', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);
    const getTrendingSpy = vi.spyOn(client, 'getTrending');

    render(<Wrapper />);

    await waitFor(() => expect(screen.getByRole('button', { name: /^refresh$/i })).toBeInTheDocument());
    expect(getTrendingSpy).not.toHaveBeenCalled();
  });

  it('shows a configuration message and no lists when the API key is not set', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);
    vi.spyOn(client, 'getTrending').mockResolvedValue({ gainers: null, losers: null, most_active: null, api_key_configured: false });

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^refresh$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }));

    await waitFor(() => expect(screen.getByText(/FMP_API_KEY/i)).toBeInTheDocument());
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders gainers, losers, and most-active rows with ticker, name, price, and change', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);
    vi.spyOn(client, 'getTrending').mockResolvedValue({
      gainers: [{ ticker: 'AAPL', name: 'Apple Inc.', price: 195.5, change_pct: 4.2 }],
      losers: [{ ticker: 'XYZ', name: 'Xyz Corp.', price: 10.0, change_pct: -6.1 }],
      most_active: [{ ticker: 'SPY', name: 'SPDR S&P 500', price: 550.0, change_pct: 0.5 }],
      api_key_configured: true,
    });

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^refresh$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }));

    await waitFor(() => expect(screen.getByText('AAPL')).toBeInTheDocument());
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    expect(screen.getByText('195.50')).toBeInTheDocument();
    expect(screen.getByText('4.20%')).toBeInTheDocument();
    expect(screen.getByText('XYZ')).toBeInTheDocument();
    expect(screen.getByText('-6.10%')).toBeInTheDocument();
    expect(screen.getByText('SPY')).toBeInTheDocument();
  });

  it('adds a ticker to the Watchlist when its row button is clicked', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'createWatchlistItem').mockResolvedValue({ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' });
    vi.spyOn(client, 'getTrending').mockResolvedValue({
      gainers: [{ ticker: 'AAPL', name: 'Apple Inc.', price: 195.5, change_pct: 4.2 }],
      losers: [],
      most_active: [],
      api_key_configured: true,
    });

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^refresh$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }));
    await waitFor(() => expect(screen.getByText('AAPL')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /add to watchlist/i }));

    // useWatchlist.create() spreads its input straight into createWatchlistItem (only overriding
    // ticker's casing) — since this component's onAdd calls create({ ticker }) with no category
    // key at all, the resulting call has no category key either, not category: null.
    await waitFor(() => expect(client.createWatchlistItem).toHaveBeenCalledWith({ ticker: 'AAPL' }));
  });

  it('does not render Add-to-Watchlist buttons until the watchlist itself has finished loading', async () => {
    let resolveWatchlist!: (items: never[]) => void;
    const watchlistPromise = new Promise<never[]>((resolve) => {
      resolveWatchlist = resolve;
    });
    vi.spyOn(client, 'listWatchlist').mockReturnValue(watchlistPromise);
    vi.spyOn(client, 'getTrending').mockResolvedValue({
      gainers: [{ ticker: 'AAPL', name: 'Apple Inc.', price: 195.5, change_pct: 4.2 }],
      losers: [],
      most_active: [],
      api_key_configured: true,
    });

    render(<Wrapper />);

    // While the watchlist is still loading, nothing about trending data (including any
    // Add-to-Watchlist button that could fire before watchedTickers is known) should render —
    // otherwise a ticker that IS already watched could briefly offer "Add" again.
    expect(screen.getByText(/loading watchlist/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^refresh$/i })).not.toBeInTheDocument();

    resolveWatchlist([]);
    await waitFor(() => expect(screen.getByRole('button', { name: /^refresh$/i })).toBeInTheDocument());
  });

  it('shows an error and does not throw an unhandled rejection when adding to the Watchlist fails', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);
    vi.spyOn(client, 'createWatchlistItem').mockRejectedValue(new client.ApiError(502, 'upstream error'));
    vi.spyOn(client, 'getTrending').mockResolvedValue({
      gainers: [{ ticker: 'AAPL', name: 'Apple Inc.', price: 195.5, change_pct: 4.2 }],
      losers: [],
      most_active: [],
      api_key_configured: true,
    });

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^refresh$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }));
    await waitFor(() => expect(screen.getByText('AAPL')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /add to watchlist/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('upstream error'));
  });

  it('shows a specific unavailable message for a list that failed to fetch, distinct from a genuinely empty list', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);
    vi.spyOn(client, 'getTrending').mockResolvedValue({
      gainers: null,
      losers: [],
      most_active: [{ ticker: 'SPY', name: 'SPDR S&P 500', price: 550.0, change_pct: 0.5 }],
      api_key_configured: true,
    });

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^refresh$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }));

    await waitFor(() => expect(screen.getByText('SPY')).toBeInTheDocument());
    expect(screen.getByText(/could not be fetched/i)).toBeInTheDocument();
    expect(screen.getByText('No data.')).toBeInTheDocument();
  });

  it('shows an already-watched row as such instead of an Add button', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getTrending').mockResolvedValue({
      gainers: [{ ticker: 'AAPL', name: 'Apple Inc.', price: 195.5, change_pct: 4.2 }],
      losers: [],
      most_active: [],
      api_key_configured: true,
    });

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^refresh$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }));

    await waitFor(() => expect(screen.getByText('AAPL')).toBeInTheDocument());
    expect(screen.getByText(/already watched/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add to watchlist/i })).not.toBeInTheDocument();
  });
});

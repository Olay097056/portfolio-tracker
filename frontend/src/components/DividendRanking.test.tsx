// frontend/src/components/DividendRanking.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { DividendRanking } from './DividendRanking';

describe('DividendRanking', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows an empty-watchlist message and no Scan button when the watchlist has no tickers', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<DividendRanking />);

    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^scan$/i })).not.toBeInTheDocument();
  });

  it('scans and renders price, gross yield, net yield (default 15% tax), frequency, and growth', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'JEPQ', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getDividendSignal').mockResolvedValue({
      ticker: 'JEPQ',
      price: 58.51,
      gross_yield_pct: 11.1,
      payment_frequency: 12,
      dividend_growth_pct: 3.2,
    });

    render(<DividendRanking />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));

    await waitFor(() => expect(screen.getByText('JEPQ')).toBeInTheDocument());
    expect(screen.getByText('58.51')).toBeInTheDocument();
    expect(screen.getByText('11.10%')).toBeInTheDocument();
    expect(screen.getByText('9.43%')).toBeInTheDocument(); // 11.1 * (1 - 15/100), floors at .toFixed(2)
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3.20%')).toBeInTheDocument();
  });

  it('recomputes net yield when the tax rate changes, without issuing a second request', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'JEPQ', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getDividendSignal').mockResolvedValue({
      ticker: 'JEPQ',
      price: 58.51,
      gross_yield_pct: 10.0,
      payment_frequency: 12,
      dividend_growth_pct: 3.2,
    });

    render(<DividendRanking />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));
    await waitFor(() => expect(screen.getByText('8.50%')).toBeInTheDocument()); // 10 * (1 - 15/100)

    fireEvent.change(screen.getByLabelText(/tax rate/i), { target: { value: '20' } });

    expect(screen.getByText('8.00%')).toBeInTheDocument(); // 10 * (1 - 20/100)
    expect(client.getDividendSignal).toHaveBeenCalledTimes(1);
  });

  it('shows a ticker that never paid as zero yield and zero frequency, not unavailable', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'NODIV', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getDividendSignal').mockResolvedValue({
      ticker: 'NODIV',
      price: 50.0,
      gross_yield_pct: 0,
      payment_frequency: 0,
      dividend_growth_pct: null,
    });

    render(<DividendRanking />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));

    await waitFor(() => expect(screen.getByText('NODIV')).toBeInTheDocument());
    // Gross and net yield are both 0.00% here (0 * anything is still 0) — two cells match.
    expect(screen.getAllByText('0.00%')).toHaveLength(2);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument(); // dividend_growth_pct: null
  });

  it('shows a row marked unavailable for a ticker whose signal could not be fetched', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'BADTICKER', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getDividendSignal').mockRejectedValue(new client.ApiError(502, 'upstream error'));

    render(<DividendRanking />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));

    await waitFor(() => expect(screen.getByText('BADTICKER')).toBeInTheDocument());
    expect(screen.getAllByText(/unavailable/i).length).toBeGreaterThan(0);
  });
});

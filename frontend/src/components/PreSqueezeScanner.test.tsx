import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { usePriceSignalsScan } from '../hooks/usePriceSignalsScan';
import { PreSqueezeScanner } from './PreSqueezeScanner';

function Wrapper() {
  const scanState = usePriceSignalsScan();
  return <PreSqueezeScanner scanState={scanState} />;
}

const fullRow = {
  percent_change_pct: 1,
  rsi_14: 1,
  volume_ratio: 1.8,
  distance_from_sma50_pct: 1,
  bb_width_pct: 4.2,
  bb_width_percentile: 12.5,
  atr_pct: 3.1,
};

describe('PreSqueezeScanner', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows an empty-watchlist message and no Scan button when the watchlist has no tickers', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<Wrapper />);

    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^scan$/i })).not.toBeInTheDocument();
  });

  it('has no period selector, unlike Momentum Scanner', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'VTI', category: null, created_at: '2026-01-01T00:00:00Z' }]);

    render(<Wrapper />);

    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());
    expect(screen.queryByLabelText(/period/i)).not.toBeInTheDocument();
  });

  it('scans without a period argument and renders all four signal columns', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'VTI', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'getPriceSignal').mockResolvedValue({ ticker: 'VTI', ...fullRow });

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));

    await waitFor(() => expect(screen.getByText('VTI')).toBeInTheDocument());
    expect(client.getPriceSignal).toHaveBeenCalledWith('VTI', '1w');
    expect(screen.getByText('4.20%')).toBeInTheDocument();
    expect(screen.getByText('12.50')).toBeInTheDocument();
    expect(screen.getByText('3.10%')).toBeInTheDocument();
    expect(screen.getByText('1.80')).toBeInTheDocument();
  });

  it('shows a signal as unavailable when its own value is null while other signals for the same ticker still render', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'NEWLISTING', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'getPriceSignal').mockResolvedValue({
      ticker: 'NEWLISTING',
      percent_change_pct: 4.0,
      rsi_14: null,
      volume_ratio: null,
      distance_from_sma50_pct: null,
      bb_width_pct: null,
      bb_width_percentile: null,
      atr_pct: null,
    });

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));

    await waitFor(() => expect(screen.getByText('NEWLISTING')).toBeInTheDocument());
    expect(screen.getAllByText('Unavailable')).toHaveLength(4);
  });

  it('shows a row marked unavailable for a ticker whose signal could not be fetched', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'BADTICKER', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'getPriceSignal').mockRejectedValue(new client.ApiError(502, 'upstream error'));

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));

    await waitFor(() => expect(screen.getByText('BADTICKER')).toBeInTheDocument());
    expect(screen.getAllByText(/unavailable/i).length).toBeGreaterThan(0);
  });
});

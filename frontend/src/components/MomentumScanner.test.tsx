// frontend/src/components/MomentumScanner.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { usePriceSignalsScan } from '../hooks/usePriceSignalsScan';
import { MomentumScanner } from './MomentumScanner';

function Wrapper() {
  const scanState = usePriceSignalsScan();
  return <MomentumScanner scanState={scanState} />;
}

describe('MomentumScanner', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows an empty-watchlist message and no Scan button when the watchlist has no tickers', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<Wrapper />);

    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^scan$/i })).not.toBeInTheDocument();
  });

  it('shows a Scan button and issues no request until it is pressed', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'VTI', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    const getPriceSignalSpy = vi.spyOn(client, 'getPriceSignal');

    render(<Wrapper />);

    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());
    expect(getPriceSignalSpy).not.toHaveBeenCalled();
  });

  it('scans each watchlist ticker, shows progress, disables the button, then renders results', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'VTI', category: null, created_at: '2026-01-01T00:00:00Z' },
      { id: 2, ticker: 'SPY', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'getPriceSignal').mockImplementation(async (ticker) => ({
      ticker,
      percent_change_pct: ticker === 'VTI' ? 1.5 : -2.25,
    }));

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));

    await waitFor(() => expect(screen.getByText('VTI')).toBeInTheDocument());
    expect(screen.getByText('SPY')).toBeInTheDocument();
    expect(screen.getByText('1.50%')).toBeInTheDocument();
    expect(screen.getByText('-2.25%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^scan$/i })).not.toBeDisabled();
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
    expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
  });

  it('sends the selected period to getPriceSignal', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'VTI', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'getPriceSignal').mockResolvedValue({ ticker: 'VTI', percent_change_pct: 1 });

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/period/i), { target: { value: '1m' } });
    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));

    await waitFor(() => expect(client.getPriceSignal).toHaveBeenCalledWith('VTI', '1m'));
  });
});

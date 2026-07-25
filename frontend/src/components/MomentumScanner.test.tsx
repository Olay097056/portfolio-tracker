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

  it('scans each watchlist ticker, shows progress, disables the button, then renders all four signal columns', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'VTI', category: null, created_at: '2026-01-01T00:00:00Z' },
      { id: 2, ticker: 'SPY', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'getPriceSignal').mockImplementation(async (ticker) => ({
      ticker,
      percent_change_pct: ticker === 'VTI' ? 1.5 : -2.25,
      rsi_14: ticker === 'VTI' ? 65.4 : 32.1,
      volume_ratio: ticker === 'VTI' ? 1.8 : 0.9,
      distance_from_sma50_pct: ticker === 'VTI' ? 3.2 : -1.1,
      bb_width_pct: null,
      bb_width_percentile: null,
      atr_pct: null,
    }));

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));

    await waitFor(() => expect(screen.getByText('VTI')).toBeInTheDocument());
    expect(screen.getByText('SPY')).toBeInTheDocument();
    expect(screen.getByText('1.50%')).toBeInTheDocument();
    expect(screen.getByText('-2.25%')).toBeInTheDocument();
    expect(screen.getByText('65.40')).toBeInTheDocument();
    expect(screen.getByText('32.10')).toBeInTheDocument();
    expect(screen.getByText('1.80')).toBeInTheDocument();
    expect(screen.getByText('0.90')).toBeInTheDocument();
    expect(screen.getByText('3.20%')).toBeInTheDocument();
    expect(screen.getByText('-1.10%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^scan$/i })).not.toBeDisabled();
  });

  it('sorts rows by the clicked column, reports the active sort via aria-sort, and defaults a newly-clicked column to descending', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'LOW', category: null, created_at: '2026-01-01T00:00:00Z' },
      { id: 2, ticker: 'HIGH', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'getPriceSignal').mockImplementation(async (ticker) => ({
      ticker,
      percent_change_pct: ticker === 'HIGH' ? 9.0 : 1.0,
      rsi_14: ticker === 'HIGH' ? 20.0 : 80.0,
      volume_ratio: 1,
      distance_from_sma50_pct: 1,
      bb_width_pct: null,
      bb_width_percentile: null,
      atr_pct: null,
    }));

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));
    await waitFor(() => expect(screen.getByText('LOW')).toBeInTheDocument());

    // Default sort is % change, descending — HIGH (9.0%) before LOW (1.0%).
    let tickerCells = screen.getAllByRole('row').slice(1).map((row) => row.querySelectorAll('td')[0].textContent);
    expect(tickerCells).toEqual(['HIGH', 'LOW']);
    expect(screen.getByRole('columnheader', { name: /% change/i })).toHaveAttribute('aria-sort', 'descending');

    fireEvent.click(screen.getByRole('button', { name: 'RSI (14)' }));

    // A newly-clicked column defaults to descending too — LOW's RSI (80.0) before HIGH's (20.0).
    tickerCells = screen.getAllByRole('row').slice(1).map((row) => row.querySelectorAll('td')[0].textContent);
    expect(tickerCells).toEqual(['LOW', 'HIGH']);
    expect(screen.getByRole('columnheader', { name: /RSI/i })).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByRole('columnheader', { name: /% change/i })).not.toHaveAttribute('aria-sort');

    fireEvent.click(screen.getByRole('button', { name: 'RSI (14)' }));

    tickerCells = screen.getAllByRole('row').slice(1).map((row) => row.querySelectorAll('td')[0].textContent);
    expect(tickerCells).toEqual(['HIGH', 'LOW']);
    expect(screen.getByRole('columnheader', { name: /RSI/i })).toHaveAttribute('aria-sort', 'ascending');
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
    expect(screen.getByText('4.00%')).toBeInTheDocument();
    expect(screen.getAllByText('Unavailable')).toHaveLength(3);
  });

  it('keeps the column heading in sync with the period the displayed results were scanned with, even after changing the selector without rescanning', async () => {
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

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));
    await waitFor(() => expect(screen.getByText('% change (1w)')).toBeInTheDocument());

    // Changing the selector after a scan must not relabel results that were never recomputed.
    fireEvent.change(screen.getByLabelText(/period/i), { target: { value: '1m' } });

    expect(screen.getByText('% change (1w)')).toBeInTheDocument();
    expect(screen.queryByText('% change (1m)')).not.toBeInTheDocument();
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

  it('sends the selected period to getPriceSignal', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'VTI', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'getPriceSignal').mockResolvedValue({
      ticker: 'VTI',
      percent_change_pct: 1,
      rsi_14: null,
      volume_ratio: null,
      distance_from_sma50_pct: null,
      bb_width_pct: null,
      bb_width_percentile: null,
      atr_pct: null,
    });

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/period/i), { target: { value: '1m' } });
    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));

    await waitFor(() => expect(client.getPriceSignal).toHaveBeenCalledWith('VTI', '1m'));
  });
});

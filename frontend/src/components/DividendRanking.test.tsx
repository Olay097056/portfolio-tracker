// frontend/src/components/DividendRanking.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { useDividendScan } from '../hooks/useDividendScan';
import { DividendRanking } from './DividendRanking';

function Wrapper() {
  const scanState = useDividendScan();
  const [taxRatePct, setTaxRatePct] = useState('15');
  return <DividendRanking scanState={scanState} taxRatePct={taxRatePct} onTaxRatePctChange={setTaxRatePct} />;
}

describe('DividendRanking', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows an empty-watchlist message and no Scan button when the watchlist has no tickers', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<Wrapper />);

    await waitFor(() => expect(screen.getByText(/watchlist is empty/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^scan$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/trending stocks today/i)).toBeInTheDocument();
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

    render(<Wrapper />);
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

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));
    await waitFor(() => expect(screen.getByText('8.50%')).toBeInTheDocument()); // 10 * (1 - 15/100)

    fireEvent.change(screen.getByLabelText(/tax rate/i), { target: { value: '20' } });

    expect(screen.getByText('8.00%')).toBeInTheDocument(); // 10 * (1 - 20/100)
    expect(client.getDividendSignal).toHaveBeenCalledTimes(1);
  });

  it('clamps a negative or over-100 tax rate so net yield never exceeds gross yield or goes negative', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'JEPQ', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getDividendSignal').mockResolvedValue({
      ticker: 'JEPQ',
      price: 58.51,
      gross_yield_pct: 10.0,
      payment_frequency: 12,
      dividend_growth_pct: 3.2,
    });

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));
    await waitFor(() => expect(screen.getByText('JEPQ')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/tax rate/i), { target: { value: '-25' } });
    // Clamped to 0% tax, so net == gross — both cells render the same '10.00%' text.
    expect(screen.getAllByText('10.00%')).toHaveLength(2);

    fireEvent.change(screen.getByLabelText(/tax rate/i), { target: { value: '150' } });
    // Clamped to 100% tax, so net == 0 while gross is unchanged — only the net cell is '0.00%'.
    expect(screen.getByText('10.00%')).toBeInTheDocument();
    expect(screen.getByText('0.00%')).toBeInTheDocument();
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

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));

    await waitFor(() => expect(screen.getByText('NODIV')).toBeInTheDocument());
    // Gross and net yield are both 0.00% here (0 * anything is still 0) — two cells match.
    expect(screen.getAllByText('0.00%')).toHaveLength(2);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument(); // dividend_growth_pct: null
  });

  it('wraps its content in a card', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    const { container } = render(<Wrapper />);

    await waitFor(() => expect(container.querySelector('.card')).not.toBeNull());
  });

  it('does not color any of its columns green/red — yield and growth are not price changes', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'JEPQ', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getDividendSignal').mockResolvedValue({
      ticker: 'JEPQ',
      price: 58.51,
      gross_yield_pct: 11.1,
      payment_frequency: 12,
      dividend_growth_pct: -3.2,
    });

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));
    await waitFor(() => expect(screen.getByText('JEPQ')).toBeInTheDocument());

    // dividend_growth_pct is negative here specifically to prove a negative signed-percent value
    // in this table still isn't colored red — the narrow-scope decision, not an accident of only
    // testing positive values.
    for (const text of ['58.51', '11.10%', '9.43%', '12', '-3.20%']) {
      const cell = screen.getByText(text);
      expect(cell).not.toHaveStyle({ color: 'var(--green)' });
      expect(cell).not.toHaveStyle({ color: 'var(--red)' });
    }
  });

  it('shows a row marked unavailable for a ticker whose signal could not be fetched', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'BADTICKER', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getDividendSignal').mockRejectedValue(new client.ApiError(502, 'upstream error'));

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));

    await waitFor(() => expect(screen.getByText('BADTICKER')).toBeInTheDocument());
    expect(screen.getAllByText(/unavailable/i).length).toBeGreaterThan(0);
  });

  it('sorts rows by the clicked column and reports the active sort via aria-sort', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'LOW', category: null, created_at: '2026-01-01T00:00:00Z' },
      { id: 2, ticker: 'HIGH', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'getDividendSignal').mockImplementation(async (ticker) => ({
      ticker,
      price: 100,
      gross_yield_pct: ticker === 'HIGH' ? 9.0 : 1.0,
      payment_frequency: 4,
      dividend_growth_pct: 1,
    }));

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));
    await waitFor(() => expect(screen.getByText('LOW')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^gross yield$/i }));

    let tickerCells = screen.getAllByRole('row').slice(1).map((row) => row.querySelectorAll('td')[0].textContent);
    expect(tickerCells).toEqual(['HIGH', 'LOW']);
    expect(screen.getByRole('columnheader', { name: /gross yield/i })).toHaveAttribute('aria-sort', 'descending');

    fireEvent.click(screen.getByRole('button', { name: /^gross yield$/i }));

    tickerCells = screen.getAllByRole('row').slice(1).map((row) => row.querySelectorAll('td')[0].textContent);
    expect(tickerCells).toEqual(['LOW', 'HIGH']);
    expect(screen.getByRole('columnheader', { name: /gross yield/i })).toHaveAttribute('aria-sort', 'ascending');
  });

  it('defaults to sorting by net yield, and keeps the displayed net-yield cells correct after the tax rate changes without a rescan', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'A', category: null, created_at: '2026-01-01T00:00:00Z' },
      { id: 2, ticker: 'B', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'getDividendSignal').mockImplementation(async (ticker) => ({
      ticker,
      price: 100,
      gross_yield_pct: ticker === 'A' ? 5.0 : 4.0,
      payment_frequency: 4,
      dividend_growth_pct: 1,
    }));

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());

    // Default sort is net yield, descending — A (5.0% gross) ranks above B (4.0% gross) since a
    // uniform tax rate scales both proportionally and can never invert their relative order.
    let tickerCells = screen.getAllByRole('row').slice(1).map((row) => row.querySelectorAll('td')[0].textContent);
    expect(tickerCells).toEqual(['A', 'B']);
    expect(screen.getByRole('columnheader', { name: /net yield/i })).toHaveAttribute('aria-sort', 'descending');

    fireEvent.change(screen.getByLabelText(/tax rate/i), { target: { value: '50' } });

    // Order is unchanged (as expected — uniform scaling), but the displayed net-yield values
    // must reflect the new rate, proving the sort re-derives from live data on every render
    // rather than reusing a value computed at an earlier tax rate.
    tickerCells = screen.getAllByRole('row').slice(1).map((row) => row.querySelectorAll('td')[0].textContent);
    expect(tickerCells).toEqual(['A', 'B']);
    expect(screen.getByText('2.50%')).toBeInTheDocument(); // A: 5.0 * (1 - 50/100)
    expect(screen.getByText('2.00%')).toBeInTheDocument(); // B: 4.0 * (1 - 50/100)
    expect(client.getDividendSignal).toHaveBeenCalledTimes(2);
  });

  it('re-derives the net-yield sort key from the live tax rate rather than a stale computed value', async () => {
    // Watchlist order is [B, A] with B the lower gross yield, so at any tax rate below 100% the
    // net-yield sort (A above B) genuinely differs from watchlist/insertion order. At 100% tax
    // every net yield collapses to exactly 0, all rows tie, and a stable sort falls back to
    // insertion order — [B, A]. If the sort key were still using the value computed at the prior
    // tax rate (stale), order would incorrectly stay [A, B]; only a live re-derivation produces
    // the [B, A] this test asserts.
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'B', category: null, created_at: '2026-01-01T00:00:00Z' },
      { id: 2, ticker: 'A', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'getDividendSignal').mockImplementation(async (ticker) => ({
      ticker,
      price: 100,
      gross_yield_pct: ticker === 'A' ? 5.0 : 4.0,
      payment_frequency: 4,
      dividend_growth_pct: 1,
    }));

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByRole('button', { name: /^scan$/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^scan$/i }));
    await waitFor(() => expect(screen.getByText('B')).toBeInTheDocument());

    // Default tax 15%, sorted by net yield descending — A's higher yield ranks first, differing
    // from the [B, A] watchlist order.
    let tickerCells = screen.getAllByRole('row').slice(1).map((row) => row.querySelectorAll('td')[0].textContent);
    expect(tickerCells).toEqual(['A', 'B']);

    fireEvent.change(screen.getByLabelText(/tax rate/i), { target: { value: '100' } });

    tickerCells = screen.getAllByRole('row').slice(1).map((row) => row.querySelectorAll('td')[0].textContent);
    expect(tickerCells).toEqual(['B', 'A']);
    expect(client.getDividendSignal).toHaveBeenCalledTimes(2);
  });
});

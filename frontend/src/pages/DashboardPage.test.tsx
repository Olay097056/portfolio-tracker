// frontend/src/pages/DashboardPage.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createChart } from 'lightweight-charts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { DashboardPage } from './DashboardPage';

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(),
  LineSeries: 'line-series-definition',
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn() })),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a ticker dropdown with none selected, listing the deduplicated union of holdings and watchlist tickers', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([
      { id: 1, name: 'Core', cash_usd: 0, target_allocation_pct: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'listHoldings').mockResolvedValue([
      {
        id: 1,
        portfolio_id: 1,
        ticker: 'VTI',
        shares: 1,
        avg_cost_usd: 1,
        target_allocation_pct: null,
        realized_pnl_usd: 0,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/ticker/i)).toHaveValue('');
    expect(screen.getByRole('option', { name: 'VTI' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'AAPL' })).toBeInTheDocument();
  });

  it('issues no chart request until a ticker is selected', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    const getChartDataSpy = vi.spyOn(client, 'getChartData');

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    expect(getChartDataSpy).not.toHaveBeenCalled();
  });

  it('fetches and renders the chart for the ticker once selected', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points: [{ time: '2026-01-02', close: 100 }] });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });

    await waitFor(() => expect(client.getChartData).toHaveBeenCalledWith('AAPL', '1Y'));
  });

  it('remounts the chart (fresh createChart, old instance removed) when the selected ticker changes', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' },
      { id: 2, ticker: 'MSFT', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points: [{ time: '2026-01-02', close: 100 }] });

    const firstRemove = vi.fn();
    const secondRemove = vi.fn();
    vi.mocked(createChart)
      .mockReturnValueOnce({
        addSeries: vi.fn(() => ({ setData: vi.fn() })),
        remove: firstRemove,
      } as unknown as ReturnType<typeof createChart>)
      .mockReturnValueOnce({
        addSeries: vi.fn(() => ({ setData: vi.fn() })),
        remove: secondRemove,
      } as unknown as ReturnType<typeof createChart>);

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(createChart).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'MSFT' } });

    await waitFor(() => expect(createChart).toHaveBeenCalledTimes(2));
    expect(firstRemove).toHaveBeenCalledTimes(1);
  });

  it('never draws the outgoing ticker stale data onto the freshly-remounted chart when the new ticker fetch fails', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' },
      { id: 2, ticker: 'MSFT', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);
    vi.spyOn(client, 'getChartData')
      .mockResolvedValueOnce({ points: [{ time: '2026-01-02', close: 100 }] })
      .mockRejectedValueOnce(new client.ApiError(502, 'upstream error'));

    const firstSetData = vi.fn();
    const secondSetData = vi.fn();
    vi.mocked(createChart)
      .mockReturnValueOnce({
        addSeries: vi.fn(() => ({ setData: firstSetData })),
        remove: vi.fn(),
      } as unknown as ReturnType<typeof createChart>)
      .mockReturnValueOnce({
        addSeries: vi.fn(() => ({ setData: secondSetData })),
        remove: vi.fn(),
      } as unknown as ReturnType<typeof createChart>);

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() =>
      expect(firstSetData).toHaveBeenCalledWith([{ time: '2026-01-02', value: 100 }]),
    );

    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'MSFT' } });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('upstream error'));
    // The new (second) chart instance must never have been fed AAPL's stale data — the failed
    // MSFT fetch means it should never be called with data at all.
    expect(secondSetData).not.toHaveBeenCalled();
  });

  it('shows a message instead of a dropdown when there are no tickers anywhere', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText(/no tickers to chart/i)).toBeInTheDocument());
    expect(screen.queryByLabelText(/ticker/i)).not.toBeInTheDocument();
  });

  it('shows an alert instead of the empty-state message when the ticker list fails to load', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockRejectedValue(new Error('backend is down'));

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('backend is down'));
    expect(screen.queryByText(/no tickers to chart/i)).not.toBeInTheDocument();
  });
});

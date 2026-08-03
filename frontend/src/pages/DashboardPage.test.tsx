// frontend/src/pages/DashboardPage.test.tsx
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
      addSeries: vi.fn(() => ({ setData: vi.fn(), createPriceLine: vi.fn(), removePriceLine: vi.fn() })),
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
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points: [{ time: '2026-01-02', close: 100 }], zones: [] });

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
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points: [{ time: '2026-01-02', close: 100 }], zones: [] });

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
      .mockResolvedValueOnce({ points: [{ time: '2026-01-02', close: 100 }], zones: [] })
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

  it('shows a range selector once a ticker is selected, defaulting to 1 year', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points: [{ time: '2026-01-02', close: 100 }], zones: [] });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    expect(screen.queryByLabelText(/range/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });

    await waitFor(() => expect(screen.getByLabelText(/range/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/range/i)).toHaveValue('1Y');
  });

  it('refetches with the new range when the range selector changes', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points: [{ time: '2026-01-02', close: 100 }], zones: [] });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(client.getChartData).toHaveBeenCalledWith('AAPL', '1Y'));

    fireEvent.change(screen.getByLabelText(/range/i), { target: { value: '5Y' } });

    await waitFor(() => expect(client.getChartData).toHaveBeenCalledWith('AAPL', '5Y'));
  });

  // Paired with the 'never draws the previous range stale data' test below — this one proves the
  // key/remount half of the range-change fix (that changing range alone produces a fresh chart
  // instance), that one proves the points-reset half (that the fresh instance never gets fed the
  // outgoing range's stale data). Neither test alone proves both halves are correct: if the
  // points-reset half regressed, this test would still pass since it only checks that remounting
  // happens, not what data the new instance receives.
  it('remounts the chart when only the range changes for the same ticker', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points: [{ time: '2026-01-02', close: 100 }], zones: [] });

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

    fireEvent.change(screen.getByLabelText(/range/i), { target: { value: '5Y' } });

    await waitFor(() => expect(createChart).toHaveBeenCalledTimes(2));
    expect(firstRemove).toHaveBeenCalledTimes(1);
  });

  // Paired with the 'remounts the chart when only the range changes' test above — this one proves
  // the points-reset half of the range-change fix, that one proves the key/remount half. This test
  // would pass vacuously (with no real coverage) if only the key/remount half were reverted: a
  // chart that never remounts also never gets a second chart instance for the
  // `secondSetData.not.toHaveBeenCalled()` assertion below to check.
  it('never draws the previous range stale data onto the freshly-remounted chart when the new range fetch fails', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData')
      .mockResolvedValueOnce({ points: [{ time: '2026-01-02', close: 100 }], zones: [] })
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
    await waitFor(() => expect(firstSetData).toHaveBeenCalledWith([{ time: '2026-01-02', value: 100 }]));

    fireEvent.change(screen.getByLabelText(/range/i), { target: { value: '5Y' } });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('upstream error'));
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

  it('passes zones from the fetch through to the chart', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    const createPriceLine = vi.fn();
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn(), createPriceLine, removePriceLine: vi.fn() })),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);
    vi.spyOn(client, 'getChartData').mockResolvedValue({
      points: [{ time: '2026-01-02', close: 100 }],
      zones: [{ id: null, price: 95, kind: 'support', strength: 3, source: 'auto' }],
    });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });

    await waitFor(() => expect(createPriceLine).toHaveBeenCalledWith(expect.objectContaining({ price: 95 })));
  });

  it('shows S, R, and Freestyle buttons and a zone list once a ticker is selected', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points: [{ time: '2026-01-02', close: 100 }], zones: [] });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });

    await waitFor(() => expect(screen.getByRole('button', { name: /^s$/i })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^r$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /freestyle/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recompute defaults/i })).toBeInTheDocument();
    expect(screen.getByText(/no support\/resistance zones/i)).toBeInTheDocument();
  });

  it('clicking S adds a support zone at the last point\'s close price and refetches', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData')
      .mockResolvedValueOnce({ points: [{ time: '2026-01-02', close: 100 }], zones: [] })
      .mockResolvedValueOnce({
        points: [{ time: '2026-01-02', close: 100 }],
        zones: [{ id: 1, price: 100, kind: 'support', strength: null, source: 'manual' }],
      });
    const freezeSpy = vi.spyOn(client, 'freezeZones').mockResolvedValue([
      { id: 1, price: 100, kind: 'support', strength: null, source: 'manual' },
    ]);

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /^s$/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^s$/i }));

    await waitFor(() => expect(freezeSpy).toHaveBeenCalledWith('AAPL', '1Y', [{ kind: 'support', price: 100 }]));
    await waitFor(() => expect(client.getChartData).toHaveBeenCalledTimes(2));
  });

  it('Recompute defaults does nothing without confirmation and clears zones when confirmed', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({
      points: [{ time: '2026-01-02', close: 100 }],
      zones: [{ id: 1, price: 100, kind: 'support', strength: null, source: 'manual' }],
    });
    const deleteAllSpy = vi.spyOn(client, 'deleteAllZones').mockResolvedValue(undefined);

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /recompute defaults/i })).toBeInTheDocument());

    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: /recompute defaults/i }));
    expect(deleteAllSpy).not.toHaveBeenCalled();

    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: /recompute defaults/i }));
    await waitFor(() => expect(deleteAllSpy).toHaveBeenCalledWith('AAPL', '1Y'));
  });

  it('disables the S/R/Freestyle/Recompute buttons while a zone mutation is in flight, then re-enables them', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points: [{ time: '2026-01-02', close: 100 }], zones: [] });
    let resolveFreeze: (value: client.Zone[]) => void;
    vi.spyOn(client, 'freezeZones').mockReturnValue(
      new Promise((resolve) => {
        resolveFreeze = resolve;
      }),
    );

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /^s$/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^s$/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /^s$/i })).toBeDisabled());
    expect(screen.getByRole('button', { name: /^r$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /freestyle/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /recompute defaults/i })).toBeDisabled();

    resolveFreeze!([{ id: 1, price: 100, kind: 'support', strength: null, source: 'manual' }]);

    await waitFor(() => expect(screen.getByRole('button', { name: /^s$/i })).not.toBeDisabled());
    expect(screen.getByRole('button', { name: /^r$/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /freestyle/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /recompute defaults/i })).not.toBeDisabled();
  });

  it('a second click on S while the first is still in flight does not fire a second freeze call', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points: [{ time: '2026-01-02', close: 100 }], zones: [] });
    let resolveFreeze: (value: client.Zone[]) => void;
    const freezeSpy = vi.spyOn(client, 'freezeZones').mockReturnValue(
      new Promise((resolve) => {
        resolveFreeze = resolve;
      }),
    );

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /^s$/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^s$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^s$/i }));

    await waitFor(() => expect(freezeSpy).toHaveBeenCalledTimes(1));

    await act(async () => {
      resolveFreeze!([{ id: 1, price: 100, kind: 'support', strength: null, source: 'manual' }]);
      await Promise.resolve();
    });

    expect(freezeSpy).toHaveBeenCalledTimes(1);
  });

  it('deleting a zone from the list calls deleteZone and refetches', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({
      points: [{ time: '2026-01-02', close: 100 }],
      zones: [{ id: 1, price: 100, kind: 'support', strength: null, source: 'manual' }],
    });
    const deleteSpy = vi.spyOn(client, 'deleteZone').mockResolvedValue(undefined);

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith(1));
  });
});

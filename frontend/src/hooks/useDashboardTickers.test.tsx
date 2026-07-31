// frontend/src/hooks/useDashboardTickers.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import * as usePortfoliosModule from './usePortfolios';
import { useDashboardTickers } from './useDashboardTickers';

const portfolioA = { id: 1, name: 'A', cash_usd: 0, target_allocation_pct: null, created_at: '2026-01-01T00:00:00Z' };
const portfolioB = { id: 2, name: 'B', cash_usd: 0, target_allocation_pct: null, created_at: '2026-01-01T00:00:00Z' };

function holding(ticker: string, portfolioId: number) {
  return {
    id: 1,
    portfolio_id: portfolioId,
    ticker,
    shares: 1,
    avg_cost_usd: 1,
    target_allocation_pct: null,
    realized_pnl_usd: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('useDashboardTickers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the deduplicated, sorted union of holdings tickers across all portfolios and watchlist tickers', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([portfolioA, portfolioB]);
    vi.spyOn(client, 'listHoldings').mockImplementation(async (portfolioId) =>
      portfolioId === 1 ? [holding('VTI', 1), holding('SPY', 1)] : [holding('SPY', 2)],
    );
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([
      { id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' },
      { id: 2, ticker: 'VTI', category: null, created_at: '2026-01-01T00:00:00Z' },
    ]);

    const { result } = renderHook(() => useDashboardTickers());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tickers).toEqual(['AAPL', 'SPY', 'VTI']);
  });

  it('is loading until portfolios, their holdings, and the watchlist have all resolved', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([portfolioA]);
    vi.spyOn(client, 'listHoldings').mockResolvedValue([holding('VTI', 1)]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    const { result } = renderHook(() => useDashboardTickers());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('returns an empty list without calling listHoldings when there are no portfolios', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    const listHoldingsSpy = vi.spyOn(client, 'listHoldings');
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    const { result } = renderHook(() => useDashboardTickers());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tickers).toEqual([]);
    expect(listHoldingsSpy).not.toHaveBeenCalled();
  });

  it('surfaces an error instead of a silently-empty ticker list when listHoldings fails', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([portfolioA]);
    vi.spyOn(client, 'listHoldings').mockRejectedValue(new Error('network down'));
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    const { result } = renderHook(() => useDashboardTickers());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('network down');
  });

  it('clears a stale holdings error once the portfolio list becomes empty', async () => {
    vi.spyOn(client, 'listHoldings').mockRejectedValue(new Error('network down'));
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);

    const portfoliosSpy = vi.spyOn(usePortfoliosModule, 'usePortfolios').mockReturnValue({
      portfolios: [portfolioA],
      loading: false,
      error: null,
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    });

    const { result, rerender } = renderHook(() => useDashboardTickers());

    await waitFor(() => expect(result.current.error).toBe('network down'));

    portfoliosSpy.mockReturnValue({
      portfolios: [],
      loading: false,
      error: null,
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    });
    rerender();

    await waitFor(() => expect(result.current.error).toBeNull());
  });
});

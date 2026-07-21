import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  createPortfolio,
  deletePortfolio,
  listPortfolios,
  updatePortfolio,
  createHolding,
  listHoldings,
  getPortfolioSummary,
} from './client';

function mockFetchOnce(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }),
  );
}

describe('api client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('listPortfolios calls GET /portfolios and returns the parsed body', async () => {
    mockFetchOnce([{ id: 1, name: 'DIME', cash_usd: 250, target_allocation_pct: 70, created_at: '2026-01-01T00:00:00Z' }]);

    const result = await listPortfolios();

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/portfolios',
      expect.objectContaining({ method: undefined }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('DIME');
  });

  it('createPortfolio POSTs the payload as JSON', async () => {
    mockFetchOnce({ id: 1, name: 'DIME', cash_usd: 0, target_allocation_pct: null, created_at: '2026-01-01T00:00:00Z' }, { status: 201 });

    await createPortfolio({ name: 'DIME' });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/portfolios',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'DIME' }),
      }),
    );
  });

  it('updatePortfolio PATCHes to the correct URL', async () => {
    mockFetchOnce({ id: 1, name: 'DIME 2', cash_usd: 0, target_allocation_pct: null, created_at: '2026-01-01T00:00:00Z' });

    await updatePortfolio(1, { name: 'DIME 2' });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/portfolios/1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'DIME 2' }) }),
    );
  });

  it('deletePortfolio DELETEs and resolves with no body on 204', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => { throw new Error('should not be called'); } }),
    );

    await expect(deletePortfolio(1)).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/portfolios/1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('throws ApiError with the backend detail message on a non-2xx response', async () => {
    mockFetchOnce({ detail: 'Portfolio not found' }, { status: 404 });

    await expect(listHoldings(999)).rejects.toBeInstanceOf(ApiError);
    await expect(listHoldings(999)).rejects.toThrow('Portfolio not found');
  });

  it('createHolding POSTs to the nested holdings path', async () => {
    mockFetchOnce(
      { id: 1, portfolio_id: 1, ticker: 'AAPL', shares: 12, avg_cost_usd: 187.4, target_allocation_pct: 20, realized_pnl_usd: 0, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { status: 201 },
    );

    await createHolding(1, { ticker: 'AAPL', shares: 12, avg_cost_usd: 187.4 });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/portfolios/1/holdings',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ ticker: 'AAPL', shares: 12, avg_cost_usd: 187.4 }) }),
    );
  });

  it('getPortfolioSummary calls GET /portfolios/{id}/summary and returns the parsed body', async () => {
    const summary = {
      id: 1,
      name: 'DIME',
      cash_usd: 250,
      target_allocation_pct: 70,
      holdings_value: 4004.88,
      total_value: 4254.88,
      unrealized_pnl: 1751.28,
      realized_pnl: 0,
      holdings: [
        {
          ticker: 'AAPL',
          shares: 12,
          avg_cost_usd: 187.4,
          current_price: 333.74,
          value: 4004.88,
          current_pct: 100,
          target_pct: 20,
          deviation_pp: 80,
          severity: 'red' as const,
          unrealized_pnl: 1755.28,
          realized_pnl: 0,
        },
      ],
    };
    mockFetchOnce(summary);

    const result = await getPortfolioSummary(1);

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/portfolios/1/summary',
      expect.objectContaining({ method: undefined }),
    );
    expect(result).toEqual(summary);
  });
});

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
  getMarketData,
  getPrices,
  getUsdToThbRate,
  listWatchlist,
  createWatchlistItem,
  deleteWatchlistItem,
  getPriceSignal,
  getDividendSignal,
  getTrending,
  getChartData,
  freezeZones,
  createZone,
  updateZone,
  deleteZone,
  deleteAllZones,
  getScreenerRefreshStatus,
  startScreenerRefresh,
  analyzeAiNarrative,
} from './client';
import type { AiSignalMetrics } from '../utils/aiTechnicalSignal';

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

  it('getMarketData fetches from /market-data with a comma-joined tickers param and returns the market_data map', async () => {
    const mockResponse = {
      market_data: { JEPQ: { price: 58.51, dividend_yield_pct: 11.1, growth_rate_pct: 10.0 } },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      }),
    );

    const result = await getMarketData(['JEPQ']);

    expect(result).toEqual(mockResponse.market_data);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/market-data?tickers=JEPQ'),
      expect.anything(),
    );
  });

  it('getPrices fetches from /prices with a comma-joined tickers param and returns the prices map', async () => {
    const mockResponse = { prices: { VTI: 210, SPY: 150 } };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      }),
    );

    const result = await getPrices(['VTI', 'SPY']);

    expect(result).toEqual(mockResponse.prices);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/prices?tickers=VTI%2CSPY'),
      expect.anything(),
    );
  });

  it('getUsdToThbRate fetches from /fx/usd-thb and returns the rate', async () => {
    const mockResponse = { usd_thb_rate: 35.2 };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      }),
    );

    const result = await getUsdToThbRate();

    expect(result).toBe(35.2);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/fx/usd-thb'), expect.anything());
  });

  it('listWatchlist calls GET /watchlist and returns the parsed body', async () => {
    mockFetchOnce([{ id: 1, ticker: 'VTI', category: 'Core', created_at: '2026-01-01T00:00:00Z' }]);

    const result = await listWatchlist();

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/watchlist',
      expect.objectContaining({ method: undefined }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe('VTI');
  });

  it('createWatchlistItem POSTs the payload as JSON', async () => {
    mockFetchOnce({ id: 1, ticker: 'VTI', category: null, created_at: '2026-01-01T00:00:00Z' }, { status: 201 });

    await createWatchlistItem({ ticker: 'VTI', category: null });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/watchlist',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ticker: 'VTI', category: null }),
      }),
    );
  });

  it('deleteWatchlistItem DELETEs the item by id', async () => {
    mockFetchOnce(undefined, { status: 204 });

    await deleteWatchlistItem(1);

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/watchlist/1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('getPriceSignal calls GET /watchlist/scan/price-signals with ticker and period', async () => {
    mockFetchOnce({ ticker: 'VTI', percent_change_pct: 2.3 });

    const result = await getPriceSignal('VTI', '1w');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/watchlist/scan/price-signals?ticker=VTI&period=1w',
      expect.objectContaining({ method: undefined }),
    );
    expect(result).toEqual({ ticker: 'VTI', percent_change_pct: 2.3 });
  });

  it('getDividendSignal calls GET /watchlist/scan/dividends with the ticker', async () => {
    mockFetchOnce({ ticker: 'JEPQ', price: 58.51, gross_yield_pct: 11.1, payment_frequency: 12, dividend_growth_pct: 3.2 });

    const result = await getDividendSignal('JEPQ');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/watchlist/scan/dividends?ticker=JEPQ',
      expect.objectContaining({ method: undefined }),
    );
    expect(result.gross_yield_pct).toBe(11.1);
  });

  it('getTrending calls GET /market/trending', async () => {
    mockFetchOnce({ gainers: [], losers: [], most_active: [], api_key_configured: true });

    const result = await getTrending();

    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/market/trending', expect.objectContaining({ method: undefined }));
    expect(result.api_key_configured).toBe(true);
  });

  it('getChartData calls GET /market/chart with ticker and range', async () => {
    mockFetchOnce({ points: [{ time: '2026-01-02', close: 100 }] });

    const result = await getChartData('VTI', '1Y');

    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/market/chart?ticker=VTI&range=1Y', expect.objectContaining({ method: undefined }));
    expect(result).toEqual({ points: [{ time: '2026-01-02', close: 100 }] });
  });

  it('getChartData accepts every range value', async () => {
    mockFetchOnce({ points: [{ time: 1735808400, close: 100 }] });

    await getChartData('VTI', '1D');

    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/market/chart?ticker=VTI&range=1D', expect.objectContaining({ method: undefined }));
  });

  it('getChartData passes zones through unchanged', async () => {
    mockFetchOnce({
      points: [{ time: '2026-01-02', close: 100 }],
      zones: [{ price: 95, kind: 'support', strength: 3, source: 'auto' }],
    });

    const result = await getChartData('VTI', '1Y');

    expect(result.zones).toEqual([{ price: 95, kind: 'support', strength: 3, source: 'auto' }]);
  });

  it('getChartData passes a manual zone with an id and null strength through unchanged', async () => {
    mockFetchOnce({
      points: [{ time: '2026-01-02', close: 100 }],
      zones: [{ id: 7, price: 95, kind: 'freestyle', strength: null, source: 'manual' }],
    });

    const result = await getChartData('VTI', '1Y');

    expect(result.zones).toEqual([{ id: 7, price: 95, kind: 'freestyle', strength: null, source: 'manual' }]);
  });

  it('freezeZones calls POST /market/chart/zones/freeze with ticker, range, and zones', async () => {
    mockFetchOnce([{ id: 1, price: 90, kind: 'support', strength: null, source: 'manual' }]);

    const result = await freezeZones('VTI', '1Y', [{ kind: 'support', price: 90 }]);

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/market/chart/zones/freeze',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ticker: 'VTI', range: '1Y', zones: [{ kind: 'support', price: 90 }] }),
      }),
    );
    expect(result).toEqual([{ id: 1, price: 90, kind: 'support', strength: null, source: 'manual' }]);
  });

  it('createZone calls POST /market/chart/zones with ticker, range, kind, and price', async () => {
    mockFetchOnce({ id: 2, price: 105, kind: 'freestyle', strength: null, source: 'manual' }, { status: 201 });

    const result = await createZone('VTI', '1Y', 'freestyle', 105);

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/market/chart/zones',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ticker: 'VTI', range: '1Y', kind: 'freestyle', price: 105 }),
      }),
    );
    expect(result.id).toBe(2);
  });

  it('updateZone calls PATCH /market/chart/zones/:id with the new price', async () => {
    mockFetchOnce({ id: 2, price: 106, kind: 'freestyle', strength: null, source: 'manual' });

    const result = await updateZone(2, 106);

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/market/chart/zones/2',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ price: 106 }) }),
    );
    expect(result.price).toBe(106);
  });

  it('deleteZone calls DELETE /market/chart/zones/:id', async () => {
    mockFetchOnce(undefined, { status: 204 });

    await deleteZone(2);

    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/market/chart/zones/2', expect.objectContaining({ method: 'DELETE' }));
  });

  it('deleteAllZones calls DELETE /market/chart/zones with ticker and range as query params', async () => {
    mockFetchOnce(undefined, { status: 204 });

    await deleteAllZones('VTI', '1Y');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/market/chart/zones?ticker=VTI&range=1Y',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('getScreenerRefreshStatus calls GET /api/screener/refresh-status', async () => {
    const status = {
      status: 'running', total: 100, completed: 40, skipped: 2,
      currentSymbol: 'AAPL', startedAt: '2026-08-05T00:00:00Z', finishedAt: null, errorMessage: null,
    };
    mockFetchOnce(status);

    const result = await getScreenerRefreshStatus();

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/screener/refresh-status',
      expect.objectContaining({ method: undefined }),
    );
    expect(result).toEqual(status);
  });

  it('startScreenerRefresh POSTs to /api/screener/refresh and returns the running status on 202', async () => {
    const status = {
      status: 'running', total: null, completed: 0, skipped: 0,
      currentSymbol: null, startedAt: '2026-08-05T00:00:00Z', finishedAt: null, errorMessage: null,
    };
    mockFetchOnce(status, { status: 202 });

    const result = await startScreenerRefresh();

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/screener/refresh',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ limit: null }) }),
    );
    expect(result).toEqual(status);
  });

  it('startScreenerRefresh treats a 409 "already running" response as success, returning the existing status', async () => {
    const existingStatus = {
      status: 'running', total: 50, completed: 10, skipped: 0,
      currentSymbol: 'MSFT', startedAt: '2026-08-05T00:00:00Z', finishedAt: null, errorMessage: null,
    };
    mockFetchOnce({ detail: { message: 'A refresh is already running', status: existingStatus } }, { status: 409 });

    const result = await startScreenerRefresh();

    expect(result).toEqual(existingStatus);
  });

  it('startScreenerRefresh throws ApiError on other failures', async () => {
    mockFetchOnce({ detail: { message: 'FINNHUB_API_KEY is not set' } }, { status: 500 });

    await expect(startScreenerRefresh()).rejects.toBeInstanceOf(ApiError);
    await expect(startScreenerRefresh()).rejects.toThrow('FINNHUB_API_KEY is not set');
  });

  it('analyzeAiNarrative sends current_price/rsi14_prev/price_prev, omitting sector/market_trend (no source for them yet)', async () => {
    mockFetchOnce({ sentiment: 'bullish', narrative: 'x', conflicting_signals: null, caveats: [] });

    const metrics: AiSignalMetrics = {
      rsi14: 58.6,
      volumeRatio: 1.2,
      distanceFromSma50Pct: 4.1,
      bbWidthPct: 10.5,
      isSqueeze: false,
      nearestSupport: null,
      nearestResistance: null,
      macd: { macdLine: 1, signalLine: 0.5, histogram: 0.5, crossover: 'BULLISH', isBullishCrossover: true, isBearishCrossover: false },
      movingAverages: { sma20: 100, sma50: 95, sma200: 90, maCrossState: 'GOLDEN_CROSS', isBullishAlignment: true, distanceFromSma50Pct: 4.1 },
      atr14: 2.1,
      tradingSetup: { entryZone: { min: 100, max: 101, formatted: '$100.00 - $101.00' }, targetPrice: { price: 110, upsidePct: 9, formatted: '' }, stopLoss: { price: 95, downsidePct: 5, formatted: '' }, riskRewardRatio: { ratio: 2, formatted: '1 : 2.00' } },
      confidenceScore: { score: 65, ratingBadge: 'BULLISH', badgeColor: '#34d399', badgeBg: '', pillars: { rsiContribution: 0, macdContribution: 0, sma50DistanceContribution: 0, volumeRatioContribution: 0, bbWidthContribution: 0, supportContribution: 0, resistanceContribution: 0 } },
      currentPrice: 571.48,
      rsi14Prev: 54.2,
      pricePrev: 558.1,
    };

    await analyzeAiNarrative('SMH', metrics);

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body.metrics.current_price).toBe(571.48);
    expect(body.metrics.rsi14_prev).toBe(54.2);
    expect(body.metrics.price_prev).toBe(558.1);
    expect(body.metrics.sector).toBeUndefined();
    expect(body.metrics.market_trend).toBeUndefined();
  });
});

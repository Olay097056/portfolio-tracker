// frontend/src/api/client.ts
import type {
  AiNarrativeResult,
  ChartData,
  ChartRange,
  DividendSignalRow,
  Holding,
  HoldingCreateInput,
  HoldingUpdateInput,
  InvestorProfile,
  MarketData,
  NewHoldingActivity,
  NextEarnings,
  PatternHistory,
  Portfolio,
  PortfolioCreateInput,
  PortfolioSummary,
  PortfolioTargetUpdate,
  PortfolioUpdateInput,
  PriceSignalRow,
  RefreshStatus,
  ScanPeriod,
  TickerPosition,
  TrendingData,
  WatchlistItem,
  WatchlistItemCreateInput,
  Zone,
  ZoneInput,
} from './types';
import type { AiSignalMetrics } from '../utils/aiTechnicalSignal';

export type { ChartData, TickerPosition, Zone, ZoneInput };

const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: init?.method,
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}) as { detail?: string });
    throw new ApiError(response.status, body.detail ?? response.statusText);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function listPortfolios(): Promise<Portfolio[]> {
  return request<Portfolio[]>('/portfolios');
}

export function createPortfolio(input: PortfolioCreateInput): Promise<Portfolio> {
  return request<Portfolio>('/portfolios', { method: 'POST', body: JSON.stringify(input) });
}

export function updatePortfolio(id: number, input: PortfolioUpdateInput): Promise<Portfolio> {
  return request<Portfolio>(`/portfolios/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function deletePortfolio(id: number): Promise<void> {
  return request<void>(`/portfolios/${id}`, { method: 'DELETE' });
}

export function rebalancePortfolioTargets(updates: PortfolioTargetUpdate[]): Promise<Portfolio[]> {
  return request<Portfolio[]>('/portfolios/rebalance-targets', {
    method: 'PATCH',
    body: JSON.stringify({ updates }),
  });
}

export function listHoldings(portfolioId: number): Promise<Holding[]> {
  return request<Holding[]>(`/portfolios/${portfolioId}/holdings`);
}

export function createHolding(portfolioId: number, input: HoldingCreateInput): Promise<Holding> {
  return request<Holding>(`/portfolios/${portfolioId}/holdings`, { method: 'POST', body: JSON.stringify(input) });
}

export function updateHolding(portfolioId: number, holdingId: number, input: HoldingUpdateInput): Promise<Holding> {
  return request<Holding>(`/portfolios/${portfolioId}/holdings/${holdingId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteHolding(portfolioId: number, holdingId: number): Promise<void> {
  return request<void>(`/portfolios/${portfolioId}/holdings/${holdingId}`, { method: 'DELETE' });
}

export function getPortfolioSummary(portfolioId: number): Promise<PortfolioSummary> {
  return request<PortfolioSummary>(`/portfolios/${portfolioId}/summary`);
}

export function adjustPortfolioCash(
  portfolioId: number,
  type: 'CASH_DEPOSIT' | 'CASH_WITHDRAW',
  amount: number,
  note?: string,
): Promise<Portfolio> {
  return request<Portfolio>(`/portfolios/${portfolioId}/cash`, {
    method: 'POST',
    body: JSON.stringify({ type, amount, note }),
  });
}

export function moveHolding(
  portfolioId: number,
  holdingId: number,
  targetPortfolioId: number,
): Promise<Portfolio> {
  return request<Portfolio>(`/portfolios/${portfolioId}/holdings/${holdingId}/move`, {
    method: 'POST',
    body: JSON.stringify({ target_portfolio_id: targetPortfolioId }),
  });
}

export function recordHoldingDividend(
  portfolioId: number,
  holdingId: number,
  amountUsd: number,
  note?: string,
): Promise<Portfolio> {
  return request<Portfolio>(`/portfolios/${portfolioId}/holdings/${holdingId}/dividend`, {
    method: 'POST',
    body: JSON.stringify({ amount_usd: amountUsd, note }),
  });
}

export interface Transaction {
  id: number;
  portfolio_id: number;
  ticker: string | null;
  type: 'BUY' | 'SELL' | 'CASH_DEPOSIT' | 'CASH_WITHDRAW' | 'DIVIDEND';
  shares: number | null;
  price: number | null;
  amount_usd: number;
  note: string | null;
  created_at: string;
}

export function listTransactions(portfolioId: number): Promise<Transaction[]> {
  return request<Transaction[]>(`/portfolios/${portfolioId}/transactions`);
}

export function createTransaction(
  portfolioId: number,
  input: {
    ticker?: string | null;
    type: 'BUY' | 'SELL' | 'CASH_DEPOSIT' | 'CASH_WITHDRAW' | 'DIVIDEND';
    shares?: number | null;
    price?: number | null;
    amount_usd: number;
    note?: string | null;
  },
): Promise<Transaction> {
  return request<Transaction>(`/portfolios/${portfolioId}/transactions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getMarketData(tickers: string[]): Promise<Record<string, MarketData>> {
  const query = tickers.join(',');
  return request<{ market_data: Record<string, MarketData> }>(`/market-data?tickers=${encodeURIComponent(query)}`).then(
    (res) => res.market_data,
  );
}

// wayfinder ticket 03 (ai-signal-investor-upgrades map)
export function getNextEarnings(ticker: string): Promise<NextEarnings> {
  return request<NextEarnings>(`/market-data/earnings?ticker=${encodeURIComponent(ticker)}`);
}

// wayfinder ticket 01/06 (ai-signal-investor-upgrades map)
export function getPatternHistory(ticker: string, signalType: string, hasConflict: boolean): Promise<PatternHistory | null> {
  const params = new URLSearchParams({ ticker, signal_type: signalType, has_conflict: String(hasConflict) });
  return request<PatternHistory | null>(`/ai-narrative/pattern-history?${params.toString()}`);
}

export function getPrices(tickers: string[]): Promise<Record<string, number>> {
  const query = tickers.join(',');
  return request<{ prices: Record<string, number> }>(`/prices?tickers=${encodeURIComponent(query)}`).then(
    (res) => res.prices,
  );
}

export function getUsdToThbRate(): Promise<number | null> {
  return request<{ usd_thb_rate: number | null }>('/fx/usd-thb').then((res) => res.usd_thb_rate);
}

export function listWatchlist(): Promise<WatchlistItem[]> {
  return request<WatchlistItem[]>('/watchlist');
}

export function createWatchlistItem(input: WatchlistItemCreateInput): Promise<WatchlistItem> {
  return request<WatchlistItem>('/watchlist', { method: 'POST', body: JSON.stringify(input) });
}

export function deleteWatchlistItem(id: number): Promise<void> {
  return request<void>(`/watchlist/${id}`, { method: 'DELETE' });
}

export function getPriceSignal(ticker: string, period: ScanPeriod): Promise<PriceSignalRow> {
  return request<PriceSignalRow>(
    `/watchlist/scan/price-signals?ticker=${encodeURIComponent(ticker)}&period=${period}`,
  );
}

export function getDividendSignal(ticker: string): Promise<DividendSignalRow> {
  return request<DividendSignalRow>(`/watchlist/scan/dividends?ticker=${encodeURIComponent(ticker)}`);
}

export function getTrending(): Promise<TrendingData> {
  return request<TrendingData>('/market/trending');
}

export function getChartData(ticker: string, range: ChartRange): Promise<ChartData> {
  return request<ChartData>(`/market/chart?ticker=${encodeURIComponent(ticker)}&range=${range}`);
}

export function freezeZones(ticker: string, range: ChartRange, zones: ZoneInput[]): Promise<Zone[]> {
  return request<Zone[]>('/market/chart/zones/freeze', {
    method: 'POST',
    body: JSON.stringify({ ticker, range, zones }),
  });
}

export function createZone(ticker: string, range: ChartRange, kind: Zone['kind'], price: number): Promise<Zone> {
  return request<Zone>('/market/chart/zones', {
    method: 'POST',
    body: JSON.stringify({ ticker, range, kind, price }),
  });
}

export function updateZone(zoneId: number, price: number): Promise<Zone> {
  return request<Zone>(`/market/chart/zones/${zoneId}`, { method: 'PATCH', body: JSON.stringify({ price }) });
}

export function deleteZone(zoneId: number): Promise<void> {
  return request<void>(`/market/chart/zones/${zoneId}`, { method: 'DELETE' });
}

export function deleteAllZones(ticker: string, range: ChartRange): Promise<void> {
  return request<void>(`/market/chart/zones?ticker=${encodeURIComponent(ticker)}&range=${range}`, { method: 'DELETE' });
}

export function getTickerPosition(ticker: string): Promise<TickerPosition | null> {
  return request<TickerPosition | null>(`/market/chart/position?ticker=${encodeURIComponent(ticker)}`);
}

async function startRefresh(path: string, body: Record<string, unknown> = {}): Promise<RefreshStatus> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const responseBody = await response.json().catch(() => ({}) as Record<string, unknown>);

  if (response.status === 202) {
    return responseBody as RefreshStatus;
  }

  // A refresh was already running when we asked to start one -- from the UI's
  // perspective that's not a failure, there IS a refresh in progress, just
  // not one this call started. Surface its status instead of throwing.
  const detail = (responseBody as { detail?: { status?: RefreshStatus; message?: string } }).detail;
  if (response.status === 409 && detail?.status) {
    return detail.status;
  }

  throw new ApiError(response.status, detail?.message ?? response.statusText);
}

export function getScreenerRefreshStatus(): Promise<RefreshStatus> {
  return request<RefreshStatus>('/api/screener/refresh-status');
}

export function startScreenerRefresh(limit?: number): Promise<RefreshStatus> {
  return startRefresh('/api/screener/refresh', { limit: limit ?? null });
}

// --- DCA Calculator API Types & Endpoints ---
export interface DcaTickerItem {
  symbol: string;
  name: string;
  // Real yfinance-fetched values, null when the fetch failed for this ticker -- never a
  // guessed/hardcoded fallback number (see backend/app/routers/dca.py).
  default_yield: number | null;
  default_growth: number | null;
}

export interface DcaStockInfo {
  symbol: string;
  company_name: string;
  current_price: number;
  dividend_yield_pct: number;
  capital_growth_pct: number;
}

export interface DcaCalculateRequest {
  initial_amount: number;
  monthly_dca: number;
  duration_years: number;
  div_yield_pct: number;
  growth_pct: number;
  tax_rate_pct?: number;
  reinvest_dividends?: boolean;
  currency?: string;
}

export interface DcaChartPoint {
  year: number;
  portfolio_value: number;
  total_invested: number;
}

export interface DcaYearlyMilestone {
  year: number;
  portfolio_value: number;
  total_invested: number;
  monthly_dividend: number;
  monthly_growth: number;
  monthly_total: number;
}

export interface DcaCalculateResponse {
  final_portfolio_value: number;
  multiplier: number;
  total_invested: number;
  accumulated_dividend: number;
  capital_gain: number;
  total_return: number;
  tax_amount: number;
  final_monthly_dividend: number;
  final_monthly_growth: number;
  final_monthly_total: number;
  chart_data: DcaChartPoint[];
  yearly_milestones: DcaYearlyMilestone[];
}

export function getDcaAvailableTickers(): Promise<DcaTickerItem[]> {
  // No hardcoded fallback list here on purpose: if the backend call fails, the caller sees
  // a real empty list (and DcaProjectionCalculator's own .catch degrades to "no dropdown,
  // manual ticker entry still works") instead of silently substituting stale guessed numbers.
  return request<DcaTickerItem[]>('/api/dca/available-tickers');
}

export async function getDcaStockInfo(ticker: string): Promise<DcaStockInfo> {
  try {
    return await request<DcaStockInfo>(`/api/dca/stock-info/${encodeURIComponent(ticker)}`);
  } catch (_err) {
    const marketData = await getMarketData([ticker]);
    const entry = marketData[ticker];
    return {
      symbol: ticker,
      company_name: ticker,
      current_price: entry?.price ?? 0,
      dividend_yield_pct: entry?.dividend_yield_pct ?? 0,
      capital_growth_pct: entry?.growth_rate_pct ?? 0,
    };
  }
}

export function calculateDcaProjectionApi(params: DcaCalculateRequest): Promise<DcaCalculateResponse> {
  return request<DcaCalculateResponse>('/api/dca/calculate', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// wayfinder ticket 04/09: converts the frontend's camelCase AiSignalMetrics (already computed by
// aiTechnicalSignal.ts) into the backend's snake_case wire format, then calls the on-demand LLM
// narrative endpoint. Never auto-triggered by a caller -- the ~35-40s latency (ticket 02) means
// this must always be a deliberate, user-initiated call (ticket 04's on-demand decision).
export function analyzeAiNarrative(ticker: string, metrics: AiSignalMetrics): Promise<AiNarrativeResult> {
  const body = {
    ticker,
    metrics: {
      rsi14: metrics.rsi14,
      volume_ratio: metrics.volumeRatio,
      distance_from_sma50_pct: metrics.distanceFromSma50Pct,
      bb_width_pct: metrics.bbWidthPct,
      is_squeeze: metrics.isSqueeze,
      nearest_support: metrics.nearestSupport
        ? { label: metrics.nearestSupport.label, price: metrics.nearestSupport.price, distance_pct: metrics.nearestSupport.distancePct }
        : null,
      nearest_resistance: metrics.nearestResistance
        ? { label: metrics.nearestResistance.label, price: metrics.nearestResistance.price, distance_pct: metrics.nearestResistance.distancePct }
        : null,
      macd: {
        macd_line: metrics.macd.macdLine,
        signal_line: metrics.macd.signalLine,
        histogram: metrics.macd.histogram,
        crossover: metrics.macd.crossover,
        is_bullish_crossover: metrics.macd.isBullishCrossover,
        is_bearish_crossover: metrics.macd.isBearishCrossover,
      },
      moving_averages: {
        sma20: metrics.movingAverages.sma20,
        sma50: metrics.movingAverages.sma50,
        sma200: metrics.movingAverages.sma200,
        ma_cross_state: metrics.movingAverages.maCrossState,
        is_bullish_alignment: metrics.movingAverages.isBullishAlignment,
        distance_from_sma50_pct: metrics.movingAverages.distanceFromSma50Pct,
      },
      atr14: metrics.atr14,
      trading_setup: metrics.tradingSetup,
      confidence_score: {
        score: metrics.confidenceScore.score,
        rating_badge: metrics.confidenceScore.ratingBadge,
        pillars: metrics.confidenceScore.pillars,
      },
      current_price: metrics.currentPrice,
      rsi14_prev: metrics.rsi14Prev,
      price_prev: metrics.pricePrev,
      // sector/market_trend intentionally omitted -- no sector or market-trend computation
      // exists anywhere in this app yet (see ai_narrative_service.py's prompt comment); the
      // backend already handles their absence with its own "no data" fallback text.
    },
  };
  return request<AiNarrativeResult>('/ai-narrative/analyze', { method: 'POST', body: JSON.stringify(body) });
}

// --- Investor Tracker API Functions (konbalongtun style) ---
export function listInvestors(search?: string, sortBy?: string): Promise<InvestorProfile[]> {
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (sortBy) params.append('sort_by', sortBy);
  const query = params.toString() ? `?${params.toString()}` : '';
  return request<InvestorProfile[]>(`/api/investors${query}`);
}

export function getInvestorProfile(slug: string): Promise<InvestorProfile> {
  return request<InvestorProfile>(`/api/investors/${encodeURIComponent(slug)}`);
}

export function listNewHoldings(): Promise<NewHoldingActivity[]> {
  return request<NewHoldingActivity[]>('/api/investors/new-holdings');
}

export interface InvestorsApiStatus {
  last_fetched_at: string;
  fetch_timestamp: number;
  investors_count: number;
  data_provider: string;
}

export function getInvestorsStatus(): Promise<InvestorsApiStatus> {
  return request<InvestorsApiStatus>('/api/investors/status');
}

export function refreshInvestorsApi(): Promise<InvestorsApiStatus> {
  return request<InvestorsApiStatus>('/api/investors/refresh', { method: 'POST' });
}


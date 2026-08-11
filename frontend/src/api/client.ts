// frontend/src/api/client.ts
import type {
  AiNarrativeResult,
  BankingDashboard,
  ChartData,
  ChartRange,
  ComparableStock,
  CompareSuggestion,
  CountriesDashboard,
  CountryBrief,
  CountryDetail,
  CountryReport,
  DividendSignalRow,
  OverviewBrief,
  OverviewDashboard,
  CmeZone,
  FearGreed,
  Holding,
  HoldingCreateInput,
  HoldingUpdateInput,
  InvestorProfile,
  MacroDashboard,
  ModelsDashboard,
  NewsList,
  SignalsDashboard,
  TradingSignal,
  MarketData,
  NewHoldingsPage,
  NextEarnings,
  PatternHistory,
  Portfolio,
  PortfolioCreateInput,
  PortfolioSummary,
  PortfolioTargetUpdate,
  PortfolioUpdateInput,
  PriceSignalRow,
    ScanPeriod,
    SimulateResponse,
  StockSearchResult,
  TickerPosition,
  TrendingData,
  WatchlistItem,
  WatchlistItemCreateInput,
  Zone,
  ZoneInput,
  BoardroomMeeting,
  BoardroomMeetingDetail,
  BoardroomList,
  BoardroomCreateInput,
  BoardroomStancesPayload,
  TradeDeskState,
  TradeDeskTurnResult,
  HyperliquidMarketsResponse,
  JobStatus,
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

// --- Fear & Greed index ---
export function getFearGreed(): Promise<FearGreed> {
  return request<FearGreed>('/api/fear-greed');
}

// --- Macro Dashboard ---
export function getMacroDashboard(): Promise<MacroDashboard> {
  return request<MacroDashboard>('/api/macro');
}

export function refreshMacroDashboard(): Promise<MacroDashboard> {
  return request<MacroDashboard>('/api/macro/refresh', { method: 'POST' });
}

// --- Overview Dashboard (bond-crisis ภาพรวม) ---
export function getOverviewDashboard(): Promise<OverviewDashboard> {
  return request<OverviewDashboard>('/api/overview');
}

export function refreshOverviewBrief(): Promise<OverviewBrief> {
  return request<OverviewBrief>('/api/overview/brief', { method: 'POST' });
}

// --- CME Zone (bond-crisis /cme) ---
export function getCmeZone(): Promise<CmeZone> {
  return request<CmeZone>('/api/cme');
}

// --- existing API functions below ---

// --- Profit Models ---
export function getModelsDashboard(): Promise<ModelsDashboard> {
  return request<ModelsDashboard>('/api/models');
}

export function refreshModelsDashboard(): Promise<ModelsDashboard> {
  return request<ModelsDashboard>('/api/models/refresh', { method: 'POST' });
}

// --- Stock Comparison tool ---
// Deliberately a different universe from searchStocks() below: only symbols that exist
// in konbalongtun's stock-summaries collection can actually be compared, so the compare
// tool's picker must suggest from that same source or it would offer dead picks.
export function compareAutocomplete(query: string, limit: number = 8): Promise<CompareSuggestion[]> {
  const trimmed = query.trim();
  if (!trimmed) return Promise.resolve([]);
  const params = new URLSearchParams({ q: trimmed, limit: String(limit) });
  return request<CompareSuggestion[]>(`/api/compare/autocomplete?${params.toString()}`);
}

export function getCompareStock(symbol: string): Promise<ComparableStock> {
  return request<{ stock: ComparableStock }>(`/api/compare/stock/${encodeURIComponent(symbol)}`).then((r) => r.stock);
}

// Shared ticker-autocomplete typeahead -- see components/TickerAutocomplete.tsx.
export function searchStocks(query: string, limit: number = 8): Promise<StockSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return Promise.resolve([]);
  const params = new URLSearchParams({ q: trimmed, limit: String(limit) });
  return request<StockSearchResult[]>(`/api/screener/search?${params.toString()}`);
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
      week52_high: metrics.week52High,
      week52_low: metrics.week52Low,
      distance_from_52w_high_pct: metrics.distanceFrom52wHighPct,
      distance_from_52w_low_pct: metrics.distanceFrom52wLowPct,
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

export function listNewHoldings(page: number = 1, limit: number = 20, search?: string): Promise<NewHoldingsPage> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) params.append('search', search);
  return request<NewHoldingsPage>(`/api/investors/new-holdings?${params.toString()}`);
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

export function getSignalsDashboard(): Promise<SignalsDashboard> {
  return request<SignalsDashboard>('/api/signals');
}

export function refreshSignalsDashboard(): Promise<SignalsDashboard> {
  return request<SignalsDashboard>('/api/signals/refresh', { method: 'POST' });
}

export function closeSignal(signalId: string): Promise<TradingSignal> {
  return request<TradingSignal>('/api/signals/close', {
    method: 'POST',
    body: JSON.stringify({ signal_id: signalId }),
  });
}


export function getNews(
  page = 1,
  sort = 'date',
  source?: string,
  minImpact?: number,
): Promise<NewsList> {
  const params = new URLSearchParams({ page: String(page), sort });
  if (source) params.set('source', source);
  if (minImpact !== undefined && minImpact !== null) params.set('min_impact', String(minImpact));
  return request<NewsList>(`/api/news?${params.toString()}`);
}

export function refreshNews(): Promise<NewsList> {
  return request<NewsList>('/api/news/refresh', { method: 'POST' });
}

export function getBankingDashboard(): Promise<BankingDashboard> {
  return request<BankingDashboard>('/api/banking');
}

export function refreshBankingDashboard(): Promise<BankingDashboard> {
  return request<BankingDashboard>('/api/banking/refresh', { method: 'POST' });
}

export function getCountriesDashboard(): Promise<CountriesDashboard> {
  return request<CountriesDashboard>('/api/countries');
}

export function refreshCountriesDashboard(): Promise<CountriesDashboard> {
  return request<CountriesDashboard>('/api/countries/refresh', { method: 'POST' });
}

export function getCountryDetail(code: string): Promise<CountryDetail> {
  return request<CountryDetail>(`/api/countries/${code}`);
}

export function getCountryBrief(code: string): Promise<CountryBrief> {
  return request<CountryBrief>(`/api/countries/${code}/brief`);
}

export function generateCountryReport(code: string): Promise<CountryReport> {
  return request<CountryReport>(`/api/countries/${code}/report`, { method: 'POST' });
}

export function simulateModels(overrides: Record<string, number>): Promise<SimulateResponse> {
  return request<SimulateResponse>('/api/models/simulate', {
    method: 'POST',
    body: JSON.stringify({ overrides }),
  });
}

// ── Boardroom (ห้องประชุม AI) ─────────────────────────────────────────────
export function listBoardroomMeetings(): Promise<BoardroomList> {
  return request<BoardroomList>('/api/boardroom/meetings');
}

export function getBoardroomMeeting(id: string): Promise<BoardroomMeetingDetail> {
  return request<BoardroomMeetingDetail>(`/api/boardroom/meetings/${id}`);
}

export function createBoardroomMeeting(input: BoardroomCreateInput): Promise<BoardroomMeeting> {
  return request<BoardroomMeeting>('/api/boardroom/meetings', { method: 'POST', body: JSON.stringify(input) });
}

export function resumeBoardroomMeeting(id: string): Promise<BoardroomMeeting> {
  return request<BoardroomMeeting>(`/api/boardroom/meetings/${id}/resume`, { method: 'POST' });
}

export function getBoardroomStances(): Promise<BoardroomStancesPayload> {
  return request<BoardroomStancesPayload>('/api/boardroom/stances');
}

// --- Trade Desk (multi-agent) ---
export function getTradeDeskState(): Promise<TradeDeskState> {
  return request<TradeDeskState>('/api/trade-desk/state');
}

export function triggerTradeDeskTurn(teamCode: string, agenda?: string): Promise<TradeDeskTurnResult> {
  const params = new URLSearchParams({ team_code: teamCode });
  if (agenda) params.set('agenda', agenda);
  return request<TradeDeskTurnResult>(`/api/trade-desk/turn?${params}`, { method: 'POST' });
}

// --- Hyperliquid markets ---
export function getHyperliquidMarkets(): Promise<HyperliquidMarketsResponse> {
  return request<HyperliquidMarketsResponse>('/api/hyperliquid/markets');
}

// --- Job status (office 3D) ---
export function getJobStatus(): Promise<JobStatus> {
  return request<JobStatus>('/api/jobs/status');
}

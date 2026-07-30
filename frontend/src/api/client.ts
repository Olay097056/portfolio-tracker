// frontend/src/api/client.ts
import type {
  DividendSignalRow,
  Holding,
  HoldingCreateInput,
  HoldingUpdateInput,
  MarketData,
  Portfolio,
  PortfolioCreateInput,
  PortfolioSummary,
  PortfolioUpdateInput,
  PriceSignalRow,
  ScanPeriod,
  TrendingData,
  WatchlistItem,
  WatchlistItemCreateInput,
} from './types';

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

export function getMarketData(tickers: string[]): Promise<Record<string, MarketData>> {
  const query = tickers.join(',');
  return request<{ market_data: Record<string, MarketData> }>(`/market-data?tickers=${encodeURIComponent(query)}`).then(
    (res) => res.market_data,
  );
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

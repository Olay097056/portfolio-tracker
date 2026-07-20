// frontend/src/api/client.ts
import type {
  Holding,
  HoldingCreateInput,
  HoldingUpdateInput,
  Portfolio,
  PortfolioCreateInput,
  PortfolioUpdateInput,
} from './types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

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

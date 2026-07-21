// frontend/src/hooks/usePortfolioSummary.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { usePortfolioSummary } from './usePortfolioSummary';

const sampleSummary = {
  id: 1,
  name: 'DIME',
  cash_usd: 250,
  target_allocation_pct: 70,
  holdings_value: 4004.88,
  total_value: 4254.88,
  unrealized_pnl: 1755.28,
  realized_pnl: 0,
  holdings: [],
};

describe('usePortfolioSummary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the summary for the given portfolio id on mount', async () => {
    vi.spyOn(client, 'getPortfolioSummary').mockResolvedValue(sampleSummary);

    const { result } = renderHook(() => usePortfolioSummary(1));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(client.getPortfolioSummary).toHaveBeenCalledWith(1);
    expect(result.current.summary).toEqual(sampleSummary);
    expect(result.current.error).toBeNull();
  });

  it('sets error and leaves summary null when the fetch fails', async () => {
    vi.spyOn(client, 'getPortfolioSummary').mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => usePortfolioSummary(1));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('network down');
    expect(result.current.summary).toBeNull();
  });

  it('refetches when the portfolio id changes', async () => {
    vi.spyOn(client, 'getPortfolioSummary').mockResolvedValue(sampleSummary);

    const { result, rerender } = renderHook(({ id }) => usePortfolioSummary(id), { initialProps: { id: 1 } });
    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ id: 2 });

    await waitFor(() => expect(client.getPortfolioSummary).toHaveBeenLastCalledWith(2));
  });
});

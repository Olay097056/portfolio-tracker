// frontend/src/hooks/useHoldings.test.tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { useHoldings } from './useHoldings';

const sampleHolding = {
  id: 1,
  portfolio_id: 1,
  ticker: 'AAPL',
  shares: 12,
  avg_cost_usd: 187.4,
  target_allocation_pct: 20,
  realized_pnl_usd: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('useHoldings', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads holdings for the given portfolio id on mount', async () => {
    vi.spyOn(client, 'listHoldings').mockResolvedValue([sampleHolding]);

    const { result } = renderHook(() => useHoldings(1));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(client.listHoldings).toHaveBeenCalledWith(1);
    expect(result.current.holdings).toEqual([sampleHolding]);
  });

  it('refetches when the portfolio id changes', async () => {
    vi.spyOn(client, 'listHoldings').mockResolvedValueOnce([sampleHolding]).mockResolvedValueOnce([]);

    const { result, rerender } = renderHook(({ id }) => useHoldings(id), { initialProps: { id: 1 } });
    await waitFor(() => expect(result.current.holdings).toEqual([sampleHolding]));

    rerender({ id: 2 });

    await waitFor(() => expect(client.listHoldings).toHaveBeenLastCalledWith(2));
  });

  it('create() adds a holding under the current portfolio and refetches', async () => {
    vi.spyOn(client, 'listHoldings').mockResolvedValueOnce([]).mockResolvedValueOnce([sampleHolding]);
    vi.spyOn(client, 'createHolding').mockResolvedValue(sampleHolding);

    const { result } = renderHook(() => useHoldings(1));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.create({ ticker: 'AAPL', shares: 12, avg_cost_usd: 187.4 });
    });

    expect(client.createHolding).toHaveBeenCalledWith(1, { ticker: 'AAPL', shares: 12, avg_cost_usd: 187.4 });
    expect(result.current.holdings).toEqual([sampleHolding]);
  });

  it('create() sets error and re-throws when the API call fails, without touching holdings', async () => {
    vi.spyOn(client, 'listHoldings').mockResolvedValue([]);
    vi.spyOn(client, 'createHolding').mockRejectedValue(new client.ApiError(400, 'Holding target allocations would exceed 100%'));

    const { result } = renderHook(() => useHoldings(1));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.create({ ticker: 'AAPL', shares: 12, avg_cost_usd: 187.4, target_allocation_pct: 90 });
      } catch (err) {
        thrown = err;
      }
    });

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe('Holding target allocations would exceed 100%');
    expect(result.current.error).toBe('Holding target allocations would exceed 100%');
    expect(result.current.holdings).toEqual([]);
  });

  it('remove() sets error and re-throws when the API call fails', async () => {
    vi.spyOn(client, 'listHoldings').mockResolvedValue([sampleHolding]);
    vi.spyOn(client, 'deleteHolding').mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useHoldings(1));
    await waitFor(() => expect(result.current.holdings).toEqual([sampleHolding]));

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.remove(1);
      } catch (err) {
        thrown = err;
      }
    });

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe('network down');
    expect(result.current.error).toBe('network down');
    expect(result.current.holdings).toEqual([sampleHolding]);
  });
});

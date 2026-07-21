// frontend/src/hooks/usePortfolios.test.tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { usePortfolios } from './usePortfolios';

const samplePortfolio = { id: 1, name: 'DIME', cash_usd: 0, target_allocation_pct: null, created_at: '2026-01-01T00:00:00Z' };

describe('usePortfolios', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads portfolios on mount', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([samplePortfolio]);

    const { result } = renderHook(() => usePortfolios());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.portfolios).toEqual([samplePortfolio]);
    expect(result.current.error).toBeNull();
  });

  it('sets error when the initial load fails', async () => {
    vi.spyOn(client, 'listPortfolios').mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => usePortfolios());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('network down');
    expect(result.current.portfolios).toEqual([]);
  });

  it('create() adds the new portfolio and refetches the list', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValueOnce([]).mockResolvedValueOnce([samplePortfolio]);
    vi.spyOn(client, 'createPortfolio').mockResolvedValue(samplePortfolio);

    const { result } = renderHook(() => usePortfolios());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.create({ name: 'DIME' });
    });

    expect(client.createPortfolio).toHaveBeenCalledWith({ name: 'DIME' });
    expect(result.current.portfolios).toEqual([samplePortfolio]);
  });

  it('remove() deletes and refetches the list', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValueOnce([samplePortfolio]).mockResolvedValueOnce([]);
    vi.spyOn(client, 'deletePortfolio').mockResolvedValue(undefined);

    const { result } = renderHook(() => usePortfolios());
    await waitFor(() => expect(result.current.portfolios).toEqual([samplePortfolio]));

    await act(async () => {
      await result.current.remove(1);
    });

    expect(client.deletePortfolio).toHaveBeenCalledWith(1);
    expect(result.current.portfolios).toEqual([]);
  });

  it('create() sets error and re-throws when the API call fails, without touching portfolios', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'createPortfolio').mockRejectedValue(new client.ApiError(400, 'Target allocations would exceed 100%'));

    const { result } = renderHook(() => usePortfolios());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.create({ name: 'DIME', target_allocation_pct: 90 });
      } catch (err) {
        thrown = err;
      }
    });

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe('Target allocations would exceed 100%');
    expect(result.current.error).toBe('Target allocations would exceed 100%');
    expect(result.current.portfolios).toEqual([]);
  });

  it('remove() sets error and re-throws when the API call fails', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([samplePortfolio]);
    vi.spyOn(client, 'deletePortfolio').mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => usePortfolios());
    await waitFor(() => expect(result.current.portfolios).toEqual([samplePortfolio]));

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
    expect(result.current.portfolios).toEqual([samplePortfolio]);
  });

  it('a successful create() clears any previous error', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'createPortfolio')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(samplePortfolio);

    const { result } = renderHook(() => usePortfolios());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      try {
        await result.current.create({ name: 'X' });
      } catch {
        // expected; asserted via result.current.error below
      }
    });
    expect(result.current.error).toBe('boom');

    await act(async () => {
      await result.current.create({ name: 'DIME' });
    });

    expect(result.current.error).toBeNull();
  });
});

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { useTrendingData } from './useTrendingData';

describe('useTrendingData', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with no data, not loading, no error', () => {
    const { result } = renderHook(() => useTrendingData());

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('issues no request until refresh is called', () => {
    const getTrendingSpy = vi.spyOn(client, 'getTrending');

    renderHook(() => useTrendingData());

    expect(getTrendingSpy).not.toHaveBeenCalled();
  });

  it('fetches and stores the data on refresh', async () => {
    const payload = {
      gainers: [{ ticker: 'AAPL', name: 'Apple Inc.', price: 195.5, change_pct: 4.2 }],
      losers: [],
      most_active: [],
      api_key_configured: true,
    };
    vi.spyOn(client, 'getTrending').mockResolvedValue(payload);

    const { result } = renderHook(() => useTrendingData());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.data).toEqual(payload);
    expect(result.current.loading).toBe(false);
  });

  it('sets an error and leaves data null when the request fails', async () => {
    vi.spyOn(client, 'getTrending').mockRejectedValue(new client.ApiError(502, 'upstream error'));

    const { result } = renderHook(() => useTrendingData());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBe('upstream error');
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('clears a previous error on a successful refresh', async () => {
    vi.spyOn(client, 'getTrending')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ gainers: [], losers: [], most_active: [], api_key_configured: true });

    const { result } = renderHook(() => useTrendingData());

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBe('boom');

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBeNull();
  });
});

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { useWatchlist } from './useWatchlist';

const sampleItem = { id: 1, ticker: 'VTI', category: 'Core', created_at: '2026-01-01T00:00:00Z' };

describe('useWatchlist', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads watchlist items on mount', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([sampleItem]);

    const { result } = renderHook(() => useWatchlist());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([sampleItem]);
    expect(result.current.error).toBeNull();
  });

  it('sets error when the initial load fails', async () => {
    vi.spyOn(client, 'listWatchlist').mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useWatchlist());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('network down');
    expect(result.current.items).toEqual([]);
  });

  it('create() adds the new item and refetches the list', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValueOnce([]).mockResolvedValueOnce([sampleItem]);
    vi.spyOn(client, 'createWatchlistItem').mockResolvedValue(sampleItem);

    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.create({ ticker: 'VTI', category: 'Core' });
    });

    expect(client.createWatchlistItem).toHaveBeenCalledWith({ ticker: 'VTI', category: 'Core' });
    expect(result.current.items).toEqual([sampleItem]);
  });

  it('remove() deletes and refetches the list', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValueOnce([sampleItem]).mockResolvedValueOnce([]);
    vi.spyOn(client, 'deleteWatchlistItem').mockResolvedValue(undefined);

    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.items).toEqual([sampleItem]));

    await act(async () => {
      await result.current.remove(1);
    });

    expect(client.deleteWatchlistItem).toHaveBeenCalledWith(1);
    expect(result.current.items).toEqual([]);
  });

  it('create() sets error and re-throws when the API call fails, without touching items', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([]);
    vi.spyOn(client, 'createWatchlistItem').mockRejectedValue(new client.ApiError(400, 'Ticker already on watchlist'));

    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.create({ ticker: 'VTI' });
      } catch (err) {
        thrown = err;
      }
    });

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe('Ticker already on watchlist');
    expect(result.current.error).toBe('Ticker already on watchlist');
    expect(result.current.items).toEqual([]);
  });

  it('remove() sets error and re-throws when the API call fails', async () => {
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([sampleItem]);
    vi.spyOn(client, 'deleteWatchlistItem').mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useWatchlist());
    await waitFor(() => expect(result.current.items).toEqual([sampleItem]));

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
    expect(result.current.items).toEqual([sampleItem]);
  });
});

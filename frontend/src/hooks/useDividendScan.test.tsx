import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { useDividendScan } from './useDividendScan';

describe('useDividendScan', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with no results and not scanning', () => {
    const { result } = renderHook(() => useDividendScan());

    expect(result.current.results).toEqual({});
    expect(result.current.scanning).toBe(false);
    expect(result.current.progress).toBeNull();
  });

  it('fetches each ticker sequentially and stores results keyed by ticker', async () => {
    const calls: string[] = [];
    vi.spyOn(client, 'getDividendSignal').mockImplementation(async (ticker) => {
      calls.push(ticker);
      return { ticker, price: 100, gross_yield_pct: 4, payment_frequency: 4, dividend_growth_pct: 2 };
    });

    const { result } = renderHook(() => useDividendScan());

    await act(async () => {
      await result.current.scan(['JEPQ', 'SCHD']);
    });

    expect(calls).toEqual(['JEPQ', 'SCHD']);
    expect(result.current.results.JEPQ.gross_yield_pct).toBe(4);
  });

  it('records a null-valued row for a ticker whose fetch fails, without abandoning the rest', async () => {
    vi.spyOn(client, 'getDividendSignal').mockImplementation(async (ticker) => {
      if (ticker === 'BADTICKER') {
        throw new client.ApiError(502, 'upstream error');
      }
      return { ticker, price: 100, gross_yield_pct: 4, payment_frequency: 4, dividend_growth_pct: 2 };
    });

    const { result } = renderHook(() => useDividendScan());

    await act(async () => {
      await result.current.scan(['JEPQ', 'BADTICKER']);
    });

    expect(result.current.results.BADTICKER).toEqual({
      ticker: 'BADTICKER',
      price: null,
      gross_yield_pct: null,
      payment_frequency: null,
      dividend_growth_pct: null,
    });
  });

  it('updates progress after each ticker and clears it when done', async () => {
    let resolveJepq!: (row: { ticker: string; price: number | null; gross_yield_pct: number | null; payment_frequency: number | null; dividend_growth_pct: number | null }) => void;
    const jepqPromise = new Promise<{ ticker: string; price: number | null; gross_yield_pct: number | null; payment_frequency: number | null; dividend_growth_pct: number | null }>((resolve) => {
      resolveJepq = resolve;
    });
    vi.spyOn(client, 'getDividendSignal').mockImplementation(async (ticker) => (ticker === 'JEPQ' ? jepqPromise : { ticker, price: 1, gross_yield_pct: 1, payment_frequency: 1, dividend_growth_pct: 1 }));

    const { result } = renderHook(() => useDividendScan());

    let scanPromise!: Promise<void>;
    act(() => {
      scanPromise = result.current.scan(['JEPQ', 'SCHD']);
    });

    await waitFor(() => expect(result.current.progress).toEqual({ done: 0, total: 2 }));

    await act(async () => {
      resolveJepq({ ticker: 'JEPQ', price: 1, gross_yield_pct: 1, payment_frequency: 1, dividend_growth_pct: 1 });
      await scanPromise;
    });

    expect(result.current.scanning).toBe(false);
    expect(result.current.progress).toBeNull();
  });

  it('replaces prior results wholesale on a new scan rather than merging', async () => {
    vi.spyOn(client, 'getDividendSignal').mockImplementation(async (ticker) => ({ ticker, price: 1, gross_yield_pct: 1, payment_frequency: 1, dividend_growth_pct: 1 }));

    const { result } = renderHook(() => useDividendScan());

    await act(async () => {
      await result.current.scan(['JEPQ']);
    });
    expect(Object.keys(result.current.results)).toEqual(['JEPQ']);

    await act(async () => {
      await result.current.scan(['SCHD']);
    });

    expect(Object.keys(result.current.results)).toEqual(['SCHD']);
  });
});

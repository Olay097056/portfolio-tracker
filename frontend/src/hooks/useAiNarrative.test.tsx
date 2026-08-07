import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { useAiNarrative } from './useAiNarrative';
import * as client from '../api/client';
import type { AiSignalMetrics } from '../utils/aiTechnicalSignal';

const sampleMetrics = {} as AiSignalMetrics; // hook never inspects the shape itself, just forwards it

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAiNarrative', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useAiNarrative());
    expect(result.current.state.status).toBe('idle');
  });

  it('transitions idle -> loading -> success on a successful call', async () => {
    vi.spyOn(client, 'analyzeAiNarrative').mockResolvedValue({
      sentiment: 'bearish',
      narrative: 'ระวัง RSI overbought',
      conflicting_signals: ['RSI overbought vs MACD bullish'],
      caveats: [],
    });

    const { result } = renderHook(() => useAiNarrative());

    act(() => {
      result.current.analyze('NVDA', sampleMetrics);
    });
    expect(result.current.state.status).toBe('loading');

    await waitFor(() => expect(result.current.state.status).toBe('success'));
    if (result.current.state.status === 'success') {
      expect(result.current.state.result.sentiment).toBe('bearish');
      expect(result.current.state.result.conflicting_signals).toEqual(['RSI overbought vs MACD bullish']);
    }
  });

  it('transitions idle -> loading -> error on a failed call', async () => {
    vi.spyOn(client, 'analyzeAiNarrative').mockRejectedValue(new client.ApiError(503, 'Ollama unreachable'));

    const { result } = renderHook(() => useAiNarrative());

    act(() => {
      result.current.analyze('NVDA', sampleMetrics);
    });
    expect(result.current.state.status).toBe('loading');

    await waitFor(() => expect(result.current.state.status).toBe('error'));
    if (result.current.state.status === 'error') {
      expect(result.current.state.message).toBe('Ollama unreachable');
    }
  });

  it('ignores a second analyze() call while one is already in flight', async () => {
    const spy = vi.spyOn(client, 'analyzeAiNarrative').mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ sentiment: 'neutral', narrative: 'x', conflicting_signals: null, caveats: [] }), 20))
    );

    const { result } = renderHook(() => useAiNarrative());

    act(() => {
      result.current.analyze('NVDA', sampleMetrics);
      result.current.analyze('NVDA', sampleMetrics); // second call, should be ignored
    });

    await waitFor(() => expect(result.current.state.status).toBe('success'));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('reset() returns to idle from an error state', async () => {
    vi.spyOn(client, 'analyzeAiNarrative').mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useAiNarrative());

    act(() => {
      result.current.analyze('NVDA', sampleMetrics);
    });
    await waitFor(() => expect(result.current.state.status).toBe('error'));

    act(() => result.current.reset());
    expect(result.current.state.status).toBe('idle');
  });
});

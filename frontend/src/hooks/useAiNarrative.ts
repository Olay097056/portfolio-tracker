// frontend/src/hooks/useAiNarrative.ts
// wayfinder ticket 04/09: on-demand local-LLM narrative, kept separate from
// useAiTechnicalSignal.ts (which is synchronous/memoized) because this one is async, user-
// triggered, and can fail -- a distinct loading/error/retry state machine, not a value derivation.
import { useCallback, useRef, useState } from 'react';
import { analyzeAiNarrative, ApiError } from '../api/client';
import type { AiNarrativeResult } from '../api/types';
import type { AiSignalMetrics } from '../utils/aiTechnicalSignal';

export type AiNarrativeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; result: AiNarrativeResult };

export function useAiNarrative() {
  const [state, setState] = useState<AiNarrativeState>({ status: 'idle' });
  // Ticket 04's cache decision lives on the backend (per ticker/date); this ref just avoids
  // firing a second in-flight request if the user double-clicks "analyze" while one is running.
  const inFlight = useRef(false);

  const analyze = useCallback(async (ticker: string, metrics: AiSignalMetrics) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState({ status: 'loading' });
    try {
      const result = await analyzeAiNarrative(ticker, metrics);
      setState({ status: 'success', result });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'AI วิเคราะห์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
      setState({ status: 'error', message });
    } finally {
      inFlight.current = false;
    }
  }, []);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, analyze, reset };
}

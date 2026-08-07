// frontend/src/hooks/usePatternHistory.ts
// wayfinder ticket 06 (ai-signal-investor-upgrades map): per-ticker pattern lookup. Triggered
// alongside useAiNarrative's analyze() (same button, per ticket 01's decision), but modeled as
// its own hook/state machine since it's fast (~1s), doesn't depend on Ollama, and can succeed or
// fail independently of the LLM call.
import { useCallback, useState } from 'react';
import { getPatternHistory } from '../api/client';
import type { PatternHistory } from '../api/types';

export type PatternHistoryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'not-enough-history' }
  | { status: 'success'; result: PatternHistory };

export function usePatternHistory() {
  const [state, setState] = useState<PatternHistoryState>({ status: 'idle' });

  const fetch_ = useCallback(async (ticker: string, signalType: string, hasConflict: boolean) => {
    setState({ status: 'loading' });
    try {
      const result = await getPatternHistory(ticker, signalType, hasConflict);
      setState(result === null ? { status: 'not-enough-history' } : { status: 'success', result });
    } catch {
      setState({ status: 'error', message: 'ดึงข้อมูลย้อนหลังไม่สำเร็จ' });
    }
  }, []);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, fetch: fetch_, reset };
}

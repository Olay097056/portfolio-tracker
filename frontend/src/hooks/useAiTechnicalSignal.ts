// frontend/src/hooks/useAiTechnicalSignal.ts
import { useMemo } from 'react';
import type { ChartPoint, Zone } from '../api/types';
import { generateAiTechnicalSignal, type AiSignalResult } from '../utils/aiTechnicalSignal';

export function useAiTechnicalSignal(
  ticker: string | null,
  points: ChartPoint[] | null,
  zones: Zone[]
): AiSignalResult {
  return useMemo(() => {
    return generateAiTechnicalSignal(ticker, points, zones);
  }, [ticker, points, zones]);
}

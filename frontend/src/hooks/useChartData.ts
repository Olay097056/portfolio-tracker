// frontend/src/hooks/useChartData.ts
import { useEffect, useRef, useState } from 'react';
import { getChartData } from '../api/client';
import type { ChartPoint, ChartRange } from '../api/types';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useChartData(ticker: string | null, range: ChartRange) {
  const [points, setPoints] = useState<ChartPoint[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Each fetch is tagged with an incrementing id. A response is only applied if it's still the
  // most recent request in flight — otherwise a slow, abandoned request for a since-replaced
  // ticker could land after a newer one and relabel the chart with the wrong ticker's data.
  const requestId = useRef(0);

  useEffect(() => {
    if (ticker === null) {
      setPoints(null);
      setLoading(false);
      setError(null);
      return;
    }

    const thisRequestId = ++requestId.current;
    setLoading(true);
    setError(null);

    getChartData(ticker, range)
      .then((data) => {
        if (requestId.current !== thisRequestId) return;
        if (data.points === null) {
          setPoints(null);
          setError(`No chart data available for ${ticker}.`);
        } else {
          setPoints(data.points);
        }
      })
      .catch((err) => {
        if (requestId.current !== thisRequestId) return;
        setPoints(null);
        setError(toMessage(err));
      })
      .finally(() => {
        if (requestId.current !== thisRequestId) return;
        setLoading(false);
      });
  }, [ticker, range]);

  return { points, loading, error };
}

export type ChartDataState = ReturnType<typeof useChartData>;

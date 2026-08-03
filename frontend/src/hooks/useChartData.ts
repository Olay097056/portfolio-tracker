// frontend/src/hooks/useChartData.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { getChartData } from '../api/client';
import type { ChartPoint, ChartRange, Zone } from '../api/types';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function chartIdentityKey(ticker: string | null, range: ChartRange): string {
  return `${ticker ?? ''}|${range}`;
}

export function useChartData(ticker: string | null, range: ChartRange) {
  const [points, setPoints] = useState<ChartPoint[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  // Each fetch is tagged with an incrementing id. A response is only applied if it's still the
  // most recent request in flight — otherwise a slow, abandoned request for a since-replaced
  // ticker could land after a newer one and relabel the chart with the wrong ticker's data.
  const requestId = useRef(0);

  // Reset the selection-scoped state (points, error, zones) synchronously during render (not in
  // the effect below) the instant the ticker+range identity changes. A parent that remounts its
  // chart via key={chartIdentityKey(...)} renders the fresh chart instance in this very commit —
  // if we waited for an effect to clear this state, the new chart's own mount effect would run
  // first (child effects commit before parent effects) and draw the outgoing selection's stale
  // data for one frame before the reset ever landed. Comparing against a ref of the previous
  // identity and calling setState during render lets React restart the render with all three
  // fields already cleared, so no commit ever pairs the new chart with the old selection's data.
  // Compares ticker+range together, not just ticker — switching range for the same ticker must
  // clear this state just as reliably as switching ticker does, for the exact same reason.
  const prevKeyRef = useRef(chartIdentityKey(ticker, range));
  const currentKey = chartIdentityKey(ticker, range);
  if (prevKeyRef.current !== currentKey) {
    prevKeyRef.current = currentKey;
    setPoints(null);
    setError(null);
    setZones([]);
  }

  const fetchChartData = useCallback(() => {
    if (ticker === null) {
      setPoints(null);
      setLoading(false);
      setError(null);
      setZones([]);
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
        setZones(data.zones ?? []);
      })
      .catch((err) => {
        if (requestId.current !== thisRequestId) return;
        setPoints(null);
        setError(toMessage(err));
        setZones([]);
      })
      .finally(() => {
        if (requestId.current !== thisRequestId) return;
        setLoading(false);
      });
  }, [ticker, range]);

  useEffect(() => {
    fetchChartData();
  }, [fetchChartData]);

  return { points, loading, error, zones, refetch: fetchChartData };
}

export type ChartDataState = ReturnType<typeof useChartData>;

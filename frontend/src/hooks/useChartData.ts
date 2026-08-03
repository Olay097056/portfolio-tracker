// frontend/src/hooks/useChartData.ts
import { useEffect, useRef, useState } from 'react';
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

  // Reset points synchronously during render (not in the effect below) the instant `ticker`
  // changes. A parent that remounts its chart via key={ticker} renders the fresh chart instance
  // in this very commit — if we waited for an effect to clear points, the new chart's own mount
  // effect would run first (child effects commit before parent effects) and draw the outgoing
  // ticker's stale points for one frame before the reset ever landed. Comparing against a ref of
  // the previous ticker and calling setPoints during render lets React restart the render with
  // points already null, so no commit ever pairs the new chart with the old ticker's data.
  // Compares ticker+range together, not just ticker — switching range for the same ticker must
  // clear points just as reliably as switching ticker does, for the exact same reason (see the
  // comment above the useEffect below): a remounted PriceChart's own mount effect runs before
  // this hook's effect can clear stale data, so the reset must happen synchronously during render.
  const prevKeyRef = useRef(chartIdentityKey(ticker, range));
  const currentKey = chartIdentityKey(ticker, range);
  if (prevKeyRef.current !== currentKey) {
    prevKeyRef.current = currentKey;
    setPoints(null);
    setError(null);
    setZones([]);
  }

  useEffect(() => {
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

  return { points, loading, error, zones };
}

export type ChartDataState = ReturnType<typeof useChartData>;

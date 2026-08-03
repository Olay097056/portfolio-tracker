// frontend/src/components/PriceChart.tsx
import { createChart, LineSeries, type IChartApi, type ISeriesApi, type Time, type UTCTimestamp } from 'lightweight-charts';
import { useEffect, useRef } from 'react';
import type { ChartPoint } from '../api/types';

interface PriceChartProps {
  points: ChartPoint[] | null;
  loading: boolean;
  error: string | null;
}

export function PriceChart({ points, loading, error }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart: IChartApi = createChart(containerRef.current, { width: 600, height: 300 });
    const series = chart.addSeries(LineSeries);
    seriesRef.current = series;
    return () => {
      chart.remove();
      seriesRef.current = null;
    };
    // Created once on mount; PriceChart is remounted by its parent when that's needed (matches
    // this codebase's existing pattern of remount-over-manual-teardown for provider-backed UI).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (seriesRef.current === null || points === null) return;
    seriesRef.current.setData(
      points.map((point) => ({
        time: (typeof point.time === 'number' ? (point.time as UTCTimestamp) : point.time) as Time,
        value: point.close,
      })),
    );
  }, [points]);

  return (
    <div>
      {loading && <div role="status">Loading chart…</div>}
      {error && <div role="alert">{error}</div>}
      <div ref={containerRef} />
    </div>
  );
}

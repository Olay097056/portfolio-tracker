// frontend/src/components/PriceChart.tsx
import {
  createChart,
  LineSeries,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useEffect, useRef } from 'react';
import type { ChartPoint, Zone } from '../api/types';

const SUPPORT_COLOR = '#14b8a6'; // teal — visually distinct from this app's rebalance-severity green/yellow/red
const RESISTANCE_COLOR = '#f59e0b'; // amber — visually distinct from this app's rebalance-severity green/yellow/red

interface PriceChartProps {
  points: ChartPoint[] | null;
  loading: boolean;
  error: string | null;
  zones: Zone[];
}

export function PriceChart({ points, loading, error, zones }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);

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

  useEffect(() => {
    if (seriesRef.current === null) return;
    priceLinesRef.current.forEach((line) => seriesRef.current!.removePriceLine(line));
    priceLinesRef.current = zones.map((zone) =>
      seriesRef.current!.createPriceLine({
        price: zone.price,
        color: zone.kind === 'support' ? SUPPORT_COLOR : RESISTANCE_COLOR,
        title: `${zone.kind === 'support' ? 'S' : 'R'} (${zone.strength})`,
      }),
    );
  }, [zones]);

  return (
    <div>
      {loading && <div role="status">Loading chart…</div>}
      {error && <div role="alert">{error}</div>}
      <div ref={containerRef} />
    </div>
  );
}

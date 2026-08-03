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
const FREESTYLE_COLOR = '#8b5cf6'; // violet — visually distinct from support/resistance and from this app's rebalance-severity green/yellow/red

const ZONE_STYLE: Record<Zone['kind'], { color: string; prefix: string }> = {
  support: { color: SUPPORT_COLOR, prefix: 'S' },
  resistance: { color: RESISTANCE_COLOR, prefix: 'R' },
  freestyle: { color: FREESTYLE_COLOR, prefix: 'F' },
};

function zoneTitle(zone: Zone): string {
  const { prefix } = ZONE_STYLE[zone.kind];
  return zone.strength === null ? prefix : `${prefix} (${zone.strength})`;
}

const HIT_TOLERANCE_PX = 6; // pixels of vertical slack around a zone's line for a mousedown to "grab" it

interface PriceChartProps {
  points: ChartPoint[] | null;
  loading: boolean;
  error: string | null;
  zones: Zone[];
  onZoneDragMove?: (zone: Zone, price: number) => void;
  onZoneDragEnd?: (zone: Zone, price: number) => void;
  disabled?: boolean;
}

export function PriceChart({ points, loading, error, zones, onZoneDragMove, onZoneDragEnd, disabled = false }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const draggingRef = useRef<{ zone: Zone; priceLine: IPriceLine } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart: IChartApi = createChart(containerRef.current, { width: 600, height: 300 });
    const series = chart.addSeries(LineSeries);
    seriesRef.current = series;
    return () => {
      chart.remove();
      seriesRef.current = null;
      priceLinesRef.current = [];
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
        color: ZONE_STYLE[zone.kind].color,
        title: zoneTitle(zone),
      }),
    );
  }, [zones]);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    function findHit(y: number): { zone: Zone; priceLine: IPriceLine } | null {
      const series = seriesRef.current;
      if (series === null) return null;
      for (let i = 0; i < zones.length; i++) {
        const lineY = series.priceToCoordinate(zones[i].price);
        if (lineY !== null && Math.abs(lineY - y) <= HIT_TOLERANCE_PX) {
          const priceLine = priceLinesRef.current[i];
          if (priceLine !== undefined) return { zone: zones[i], priceLine };
        }
      }
      return null;
    }

    function priceAt(y: number): number | null {
      return seriesRef.current === null ? null : seriesRef.current.coordinateToPrice(y);
    }

    function handleMouseDown(event: MouseEvent) {
      if (disabled) return;
      const rect = container!.getBoundingClientRect();
      const hit = findHit(event.clientY - rect.top);
      if (hit === null) return;
      // A zone line was actually grabbed: suppress this event before it reaches
      // lightweight-charts' own canvas-level handlers (registered via capture below) so that
      // dragging a zone line does not also pan/scale the chart or trigger text selection
      // underneath it. An ordinary click on empty chart area (hit === null) must NOT be
      // suppressed, so the chart keeps panning/zooming as normal for non-zone clicks.
      event.preventDefault();
      event.stopPropagation();
      draggingRef.current = hit;
    }

    function handleMouseMove(event: MouseEvent) {
      const dragging = draggingRef.current;
      if (dragging === null) return;
      const rect = container!.getBoundingClientRect();
      const price = priceAt(event.clientY - rect.top);
      if (price === null) return;
      dragging.priceLine.applyOptions({ price });
      onZoneDragMove?.(dragging.zone, price);
    }

    function handleMouseUp(event: MouseEvent) {
      const dragging = draggingRef.current;
      draggingRef.current = null;
      if (dragging === null) return;
      const rect = container!.getBoundingClientRect();
      const price = priceAt(event.clientY - rect.top);
      // Always snap the price line back to the zone's last known-good price before attempting
      // to commit the drag. If the commit succeeds, the [zones] effect re-run (triggered by the
      // subsequent refetch) will redraw the server-confirmed price. If the commit is dropped by
      // the busy-guard or fails, the line never keeps showing an unpersisted price — it already
      // matches what ZoneList shows. A brief "snap back then forward" on the success path is an
      // acceptable trade-off for never lying about what's persisted.
      dragging.priceLine.applyOptions({ price: dragging.zone.price });
      if (price === null) return;
      onZoneDragEnd?.(dragging.zone, price);
    }

    // Capture phase: run before lightweight-charts' own listeners, which it attaches directly to
    // the canvas elements it creates inside this container (closer to the target than a
    // bubble-phase ancestor listener, so they'd otherwise fire first).
    container.addEventListener('mousedown', handleMouseDown, { capture: true });
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      container.removeEventListener('mousedown', handleMouseDown, { capture: true });
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [zones, disabled, onZoneDragMove, onZoneDragEnd]);

  return (
    <div>
      {loading && <div role="status">Loading chart…</div>}
      {error && <div role="alert">{error}</div>}
      <div ref={containerRef} data-testid="price-chart" />
    </div>
  );
}

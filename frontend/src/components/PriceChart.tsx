// frontend/src/components/PriceChart.tsx
// Renders a full wethaiinvest-style candlestick chart with:
//   - CandlestickSeries for OHLC bars (แท่งเทียน)
//   - HistogramSeries for volume bars (Volume)
//   - 3 LineSeries overlays for Bollinger Bands (upper, middle, lower)
//   - Drag-and-drop support/resistance price lines
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useEffect, useRef } from 'react';
import type { ChartPoint, Zone } from '../api/types';
import { ZONE_STYLE } from '../utils/zoneStyle';

// Reads a theme CSS custom property's resolved value at call time. lightweight-charts draws to
// a <canvas>, whose 2D context only accepts literal resolved color strings — a raw
// `"var(--card-bg)"` string is not resolved by the Canvas API the way it would be for a CSS
// property, so this must read the actual computed value rather than pass the var() reference
// through. theme.css stays the single source of truth; this never hardcodes a second copy of
// the hex values.
function resolveCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value === '' ? fallback : value;
}

function zoneTitle(zone: Zone): string {
  const { prefix } = ZONE_STYLE[zone.kind];
  return zone.strength === null ? prefix : `${prefix} (${zone.strength})`;
}

const HIT_TOLERANCE_PX = 6; // pixels of vertical slack around a zone's line for a mousedown to "grab" it

// Compute Bollinger Bands (20-period SMA ± 2σ) from close prices
function computeBollingerBands(
  points: ChartPoint[],
  period = 20,
  multiplier = 2,
): { time: Time; upper: number; middle: number; lower: number }[] {
  const result: { time: Time; upper: number; middle: number; lower: number }[] = [];
  for (let i = period - 1; i < points.length; i++) {
    const slice = points.slice(i - period + 1, i + 1).map((p) => p.close);
    const sma = slice.reduce((s, v) => s + v, 0) / period;
    const variance = slice.reduce((s, v) => s + (v - sma) ** 2, 0) / period;
    const stddev = Math.sqrt(variance);
    const p = points[i];
    const time = (typeof p.time === 'number' ? (p.time as UTCTimestamp) : p.time) as Time;
    result.push({
      time,
      upper: sma + multiplier * stddev,
      middle: sma,
      lower: sma - multiplier * stddev,
    });
  }
  return result;
}

interface PriceChartProps {
  points: ChartPoint[] | null;
  loading: boolean;
  error: string | null;
  zones: Zone[];
  showBollinger?: boolean;
  showVolume?: boolean;
  onZoneDragMove?: (zone: Zone, price: number) => void;
  onZoneDragEnd?: (zone: Zone, price: number) => void;
  disabled?: boolean;
}

export function PriceChart({
  points,
  loading,
  error,
  zones,
  showBollinger = true,
  showVolume = true,
  onZoneDragMove,
  onZoneDragEnd,
  disabled = false,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // Main candlestick series
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  // Volume histogram
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  // Bollinger Band series (upper, middle/SMA, lower)
  const bbUpperRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbMiddleRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<'Line'> | null>(null);

  const priceLinesRef = useRef<IPriceLine[]>([]);
  const draggingRef = useRef<{ zone: Zone; priceLine: IPriceLine } | null>(null);

  // Create chart once on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const chart: IChartApi = createChart(containerRef.current, {
      width: containerRef.current.clientWidth || 800,
      height: 400,
      layout: {
        background: { type: ColorType.Solid, color: resolveCssVar('--card-bg', '#13192b') },
        textColor: resolveCssVar('--text', '#e2e8f0'),
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.06)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.06)' },
      },
      crosshair: {
        vertLine: { color: 'rgba(100, 200, 255, 0.4)', width: 1 },
        horzLine: { color: 'rgba(100, 200, 255, 0.4)', width: 1 },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.1)',
      },
    });

    chartRef.current = chart;

    // Candlestick series (main OHLC bars)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderUpColor: '#10b981',
      borderDownColor: '#f43f5e',
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
    });
    candleSeriesRef.current = candleSeries;

    // Volume histogram (secondary pane at bottom)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: 'rgba(100, 180, 255, 0.35)',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
      borderVisible: false,
    });
    volumeSeriesRef.current = volumeSeries;

    // Bollinger Bands (3 line series — all on the same main price scale)
    const bbUpper = chart.addSeries(LineSeries, {
      color: 'rgba(251, 191, 36, 0.6)',
      lineWidth: 1,
      lineStyle: 2, // dashed
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    const bbMiddle = chart.addSeries(LineSeries, {
      color: 'rgba(251, 191, 36, 0.9)',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    const bbLower = chart.addSeries(LineSeries, {
      color: 'rgba(251, 191, 36, 0.6)',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    bbUpperRef.current = bbUpper;
    bbMiddleRef.current = bbMiddle;
    bbLowerRef.current = bbLower;

    // Auto-fit on resize
    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.resize(containerRef.current.clientWidth, 400);
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      bbUpperRef.current = null;
      bbMiddleRef.current = null;
      bbLowerRef.current = null;
      priceLinesRef.current = [];
    };
    // Created once on mount — chart remounted by parent when needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Feed OHLCV data whenever points change
  useEffect(() => {
    if (candleSeriesRef.current === null || points === null) return;

    const candleData = points.map((p) => ({
      time: (typeof p.time === 'number' ? (p.time as UTCTimestamp) : p.time) as Time,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
    }));
    candleSeriesRef.current.setData(candleData);

    // Volume bars — green when close >= open, red when down
    if (volumeSeriesRef.current !== null && showVolume) {
      volumeSeriesRef.current.setData(
        points.map((p) => ({
          time: (typeof p.time === 'number' ? (p.time as UTCTimestamp) : p.time) as Time,
          value: p.volume,
          color: p.close >= p.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)',
        })),
      );
    } else if (volumeSeriesRef.current !== null) {
      volumeSeriesRef.current.setData([]);
    }

    // Bollinger Bands
    if (showBollinger && points.length >= 20) {
      const bb = computeBollingerBands(points);
      bbUpperRef.current?.setData(bb.map((b) => ({ time: b.time, value: b.upper })));
      bbMiddleRef.current?.setData(bb.map((b) => ({ time: b.time, value: b.middle })));
      bbLowerRef.current?.setData(bb.map((b) => ({ time: b.time, value: b.lower })));
    } else {
      bbUpperRef.current?.setData([]);
      bbMiddleRef.current?.setData([]);
      bbLowerRef.current?.setData([]);
    }

    chartRef.current?.timeScale().fitContent();
  }, [points, showBollinger, showVolume]);

  // Draw S/R price lines from zones
  useEffect(() => {
    if (candleSeriesRef.current === null) return;
    priceLinesRef.current.forEach((line) => candleSeriesRef.current!.removePriceLine(line));
    priceLinesRef.current = zones.map((zone) =>
      candleSeriesRef.current!.createPriceLine({
        price: zone.price,
        color: ZONE_STYLE[zone.kind].color,
        lineWidth: 2,
        lineStyle: zone.source === 'auto' ? 2 : 0,
        axisLabelVisible: true,
        title: zoneTitle(zone),
      }),
    );
  }, [zones]);

  // Drag-and-drop zone line handlers
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    function findHit(y: number): { zone: Zone; priceLine: IPriceLine } | null {
      const series = candleSeriesRef.current;
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
      return candleSeriesRef.current === null ? null : candleSeriesRef.current.coordinateToPrice(y);
    }

    function handleMouseDown(event: MouseEvent) {
      if (disabled) return;
      const rect = container!.getBoundingClientRect();
      const hit = findHit(event.clientY - rect.top);
      if (hit === null) return;
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
      dragging.priceLine.applyOptions({ price: dragging.zone.price });
      if (price === null) return;
      onZoneDragEnd?.(dragging.zone, price);
    }

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
      <div ref={containerRef} data-testid="price-chart" style={{ width: '100%' }} />
    </div>
  );
}

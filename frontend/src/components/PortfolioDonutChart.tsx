// frontend/src/components/PortfolioDonutChart.tsx
import type { HoldingStats } from '../api/types';

// Deliberately excludes red/green/amber — those are already reserved elsewhere
// in this app for P&L sign and rebalance severity; reusing them on a holding
// slice would read as a signal that isn't one.
export const HOLDING_COLORS = [
  '#3b82f6', // blue (same as --primary)
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
  '#14b8a6', // teal
  '#6366f1', // indigo
  '#94a3b8', // slate
];

interface PortfolioDonutChartProps {
  holdings: HoldingStats[];
  totalValue: number;
  pnlValue: number;
  pnlPct: number;
  currencySymbol?: string;
  size?: number;
}

const STROKE_WIDTH = 16;

export function PortfolioDonutChart({
  holdings,
  totalValue,
  pnlValue,
  pnlPct,
  currencySymbol = '$',
  size = 120,
}: PortfolioDonutChartProps) {
  const radius = (size - STROKE_WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const totalHoldingsValue = holdings.reduce((sum, h) => sum + h.value, 0);
  const hasHoldings = holdings.length > 0 && totalHoldingsValue > 0;

  let offsetSoFar = 0;
  const segments = hasHoldings
    ? holdings.map((h, index) => {
        const fraction = h.value / totalHoldingsValue;
        const dash = fraction * circumference;
        const seg = {
          ticker: h.ticker,
          color: HOLDING_COLORS[index % HOLDING_COLORS.length],
          dasharray: `${dash} ${circumference - dash}`,
          dashoffset: -offsetSoFar,
        };
        offsetSoFar += dash;
        return seg;
      })
    : [];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Portfolio allocation chart">
          {hasHoldings ? (
            segments.map((seg) => (
              <circle
                key={seg.ticker}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={STROKE_WIDTH}
                strokeDasharray={seg.dasharray}
                strokeDashoffset={seg.dashoffset}
                transform={`rotate(-90 ${center} ${center})`}
              />
            ))
          ) : (
            <circle
              data-testid="donut-empty-ring"
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="var(--border)"
              strokeWidth={STROKE_WIDTH}
            />
          )}
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            textAlign: 'center',
            padding: '0 8px',
          }}
        >
          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text)' }}>
            {currencySymbol}
            {totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
          {hasHoldings && (
            <span aria-label="Unrealized P&L" data-testid="donut-pnl">
              <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: pnlValue >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {pnlValue >= 0 ? '+' : ''}
                {currencySymbol}
                {pnlValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} {pnlValue >= 0 ? '😊' : '😟'}
              </span>
              <span style={{ display: 'block', fontSize: '0.65rem', fontWeight: 700, color: pnlValue >= 0 ? 'var(--green)' : 'var(--red)' }}>
                ({pnlPct >= 0 ? '+' : ''}
                {pnlPct.toFixed(2)}%)
              </span>
            </span>
          )}
        </div>
      </div>

      {hasHoldings && (
        <div role="list" aria-label="Holdings legend" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {holdings.map((h, index) => (
            <div key={h.ticker} role="listitem" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                aria-hidden="true"
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  flexShrink: 0,
                  backgroundColor: HOLDING_COLORS[index % HOLDING_COLORS.length],
                }}
              />
              <span style={{ fontSize: '0.82rem', color: 'var(--text)' }}>{h.ticker}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

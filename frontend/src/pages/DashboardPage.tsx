// frontend/src/pages/DashboardPage.tsx
import { useState } from 'react';
import type { ChartRange, Zone } from '../api/types';
import { PriceChart } from '../components/PriceChart';
import { ZoneList } from '../components/ZoneList';
import { chartIdentityKey, useChartData } from '../hooks/useChartData';
import { useDashboardTickers } from '../hooks/useDashboardTickers';
import { useZoneEditing } from '../hooks/useZoneEditing';
import { formatNumber } from '../utils/signalFormatting';
import { ZONE_STYLE } from '../utils/zoneStyle';

const RANGES: { value: ChartRange; label: string }[] = [
  { value: '1D', label: '1 day' },
  { value: '5D', label: '5 days' },
  { value: '1M', label: '1 month' },
  { value: '6M', label: '6 months' },
  { value: 'YTD', label: 'Year to date' },
  { value: '1Y', label: '1 year' },
  { value: '5Y', label: '5 years' },
];

// Adds an explicit "+" for positive values — Intl/toFixed alone never do, and this app's
// gain/loss readouts (this one, plus the --green/--red color it's paired with) need the sign
// to be visually unambiguous at a glance, not just implied by color.
function formatSigned(value: number, decimals = 2): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}`;
}

export function DashboardPage() {
  const { tickers, loading: tickersLoading, error: tickersError } = useDashboardTickers();
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [range, setRange] = useState<ChartRange>('1Y');
  const { points, loading, error, zones, refetch } = useChartData(selectedTicker, range);
  const zoneEditing = useZoneEditing(selectedTicker, range, zones, refetch);
  const [dragPreview, setDragPreview] = useState<{ zone: Zone; price: number } | null>(null);
  const displayZones = dragPreview === null ? zones : zones.map((z) => (z === dragPreview.zone ? { ...z, price: dragPreview.price } : z));

  const currentPrice = points !== null && points.length > 0 ? points[points.length - 1].close : null;
  // The change readout needs two points (today's close and the prior one) — with fewer than
  // that (loading, error, or a single-point range) it's omitted entirely rather than shown as
  // zero or fabricated, matching this project's standing never-fabricate principle.
  const previousClose = points !== null && points.length > 1 ? points[points.length - 2].close : null;
  const priceChange = currentPrice !== null && previousClose !== null ? currentPrice - previousClose : null;
  const priceChangePercent =
    priceChange !== null && previousClose !== null && previousClose !== 0 ? (priceChange / previousClose) * 100 : null;

  function handleAddZone(kind: 'support' | 'resistance' | 'freestyle') {
    if (currentPrice === null) return;
    void zoneEditing.addZone(kind, currentPrice);
  }

  function handleRecomputeDefaults() {
    if (!window.confirm('This will discard every zone you have placed for this ticker and range. Continue?')) {
      return;
    }
    void zoneEditing.recomputeDefaults();
  }

  return (
    <div>
      <h2>Dashboard</h2>

      {tickersError ? (
        <div role="alert">{tickersError}</div>
      ) : tickersLoading ? (
        <div>Loading tickers…</div>
      ) : tickers.length === 0 ? (
        <p>No tickers to chart yet — add a holding or a Watchlist ticker first.</p>
      ) : (
        <>
          <div className="card">
            <label htmlFor="dashboard-ticker">Ticker</label>
            <select id="dashboard-ticker" value={selectedTicker ?? ''} onChange={(e) => setSelectedTicker(e.target.value || null)}>
              <option value="">Select a ticker…</option>
              {tickers.map((ticker) => (
                <option key={ticker} value={ticker}>
                  {ticker}
                </option>
              ))}
            </select>

            {selectedTicker && (
              <>
                {priceChange !== null && priceChangePercent !== null && (
                  <div>
                    <span style={{ fontSize: 24, fontWeight: 700 }}>{formatNumber(currentPrice)}</span>{' '}
                    <span style={{ color: priceChange >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                      {formatSigned(priceChange)} ({formatSigned(priceChangePercent)}%)
                    </span>
                  </div>
                )}

                <div role="group" aria-label="Range">
                  {RANGES.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      aria-pressed={r.value === range}
                      onClick={() => setRange(r.value)}
                      style={r.value === range ? { borderColor: 'var(--primary)', color: 'var(--primary)' } : undefined}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>

                <PriceChart
                  key={chartIdentityKey(selectedTicker, range)}
                  points={points}
                  loading={loading}
                  error={error}
                  zones={zones}
                  onZoneDragMove={(zone, price) => setDragPreview({ zone, price })}
                  onZoneDragEnd={(zone, price) => {
                    setDragPreview(null);
                    void zoneEditing.dragZonePrice(zone, price);
                  }}
                  disabled={zoneEditing.busy}
                />

                {zoneEditing.error && <div role="alert">{zoneEditing.error}</div>}

                <button
                  type="button"
                  onClick={() => handleAddZone('support')}
                  disabled={zoneEditing.busy}
                  style={{ borderColor: ZONE_STYLE.support.color, color: ZONE_STYLE.support.color }}
                >
                  S
                </button>
                <button
                  type="button"
                  onClick={() => handleAddZone('resistance')}
                  disabled={zoneEditing.busy}
                  style={{ borderColor: ZONE_STYLE.resistance.color, color: ZONE_STYLE.resistance.color }}
                >
                  R
                </button>
                <button
                  type="button"
                  onClick={() => handleAddZone('freestyle')}
                  disabled={zoneEditing.busy}
                  style={{ borderColor: ZONE_STYLE.freestyle.color, color: ZONE_STYLE.freestyle.color }}
                >
                  Freestyle
                </button>
                <button
                  type="button"
                  onClick={handleRecomputeDefaults}
                  disabled={zoneEditing.busy}
                  style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
                >
                  Recompute defaults
                </button>

                {zoneEditing.busy && <span aria-live="polite">Working…</span>}
              </>
            )}
          </div>

          {selectedTicker && (
            <div className="card">
              <ZoneList
                zones={displayZones}
                onEditPrice={zoneEditing.editZonePrice}
                onDelete={zoneEditing.removeZone}
                disabled={zoneEditing.busy}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// frontend/src/pages/DashboardPage.tsx
import { useState } from 'react';
import type { ChartRange, Zone } from '../api/types';
import { PriceChart } from '../components/PriceChart';
import { ZoneList } from '../components/ZoneList';
import { chartIdentityKey, useChartData } from '../hooks/useChartData';
import { useDashboardTickers } from '../hooks/useDashboardTickers';
import { useZoneEditing } from '../hooks/useZoneEditing';

const RANGES: { value: ChartRange; label: string }[] = [
  { value: '1D', label: '1 day' },
  { value: '5D', label: '5 days' },
  { value: '1M', label: '1 month' },
  { value: '6M', label: '6 months' },
  { value: 'YTD', label: 'Year to date' },
  { value: '1Y', label: '1 year' },
  { value: '5Y', label: '5 years' },
];

export function DashboardPage() {
  const { tickers, loading: tickersLoading, error: tickersError } = useDashboardTickers();
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [range, setRange] = useState<ChartRange>('1Y');
  const { points, loading, error, zones, refetch } = useChartData(selectedTicker, range);
  const zoneEditing = useZoneEditing(selectedTicker, range, zones, refetch);
  const [dragPreview, setDragPreview] = useState<{ zone: Zone; price: number } | null>(null);
  const displayZones = dragPreview === null ? zones : zones.map((z) => (z === dragPreview.zone ? { ...z, price: dragPreview.price } : z));

  const currentPrice = points !== null && points.length > 0 ? points[points.length - 1].close : null;

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
              <label htmlFor="dashboard-range">Range</label>
              <select id="dashboard-range" value={range} onChange={(e) => setRange(e.target.value as ChartRange)}>
                {RANGES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>

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

              <button type="button" onClick={() => handleAddZone('support')} disabled={zoneEditing.busy}>
                S
              </button>
              <button type="button" onClick={() => handleAddZone('resistance')} disabled={zoneEditing.busy}>
                R
              </button>
              <button type="button" onClick={() => handleAddZone('freestyle')} disabled={zoneEditing.busy}>
                Freestyle
              </button>
              <button type="button" onClick={handleRecomputeDefaults} disabled={zoneEditing.busy}>
                Recompute defaults
              </button>

              <ZoneList
                zones={displayZones}
                onEditPrice={zoneEditing.editZonePrice}
                onDelete={zoneEditing.removeZone}
                disabled={zoneEditing.busy}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

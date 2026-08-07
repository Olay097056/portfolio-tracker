// frontend/src/components/HoldingRow.tsx
import { useState } from 'react';
import type { Holding, HoldingStats } from '../api/types';
import { DcaCalculator } from './DcaCalculator';
import { StressTestCalculator } from './StressTestCalculator';

const SEVERITY_COLOR: Record<'green' | 'yellow' | 'red', string> = {
  green: 'var(--green)',
  yellow: 'var(--yellow)',
  red: 'var(--red)',
};

const SEVERITY_LABEL: Record<'green' | 'yellow' | 'red', string> = {
  green: '🟢 ปกติ',
  yellow: '🟡 เบี่ยงเบนเล็กน้อย',
  red: '🔴 ต้องปรับพอร์ต',
};

interface HoldingRowProps {
  holding: Holding;
  onDelete: (id: number) => void;
  stats?: HoldingStats;
  currencyMultiplier?: number;
  currencySymbol?: string;
  isTableRow?: boolean;
}

export function HoldingRow({
  holding,
  onDelete,
  stats,
  currencyMultiplier = 1,
  currencySymbol = '$',
  isTableRow = false,
}: HoldingRowProps) {
  const [calculatorsOpen, setCalculatorsOpen] = useState(false);

  const avgCostConverted = holding.avg_cost_usd * currencyMultiplier;
  const currentPriceConverted = stats ? stats.current_price * currencyMultiplier : null;
  const valueConverted = stats ? stats.value * currencyMultiplier : null;
  const pnlConverted = stats ? stats.unrealized_pnl * currencyMultiplier : null;
  const pnlPct = stats && holding.avg_cost_usd > 0
    ? ((stats.current_price - holding.avg_cost_usd) / holding.avg_cost_usd) * 100
    : null;

  const isProfit = (pnlConverted ?? 0) >= 0;

  if (isTableRow) {
    return (
      <>
        <tr className="holding-row">
          {/* 1. Ticker */}
          <td>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {stats && (
                <span
                  data-testid="severity-indicator"
                  data-severity={stats.severity ?? 'none'}
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    flexShrink: 0,
                    backgroundColor: stats.severity !== null ? SEVERITY_COLOR[stats.severity] : 'transparent',
                  }}
                />
              )}
              <span style={{ fontWeight: 800, color: 'var(--primary)', fontFamily: 'Outfit, sans-serif' }}>
                {holding.ticker}
              </span>
            </div>
          </td>

          {/* 2. Shares */}
          <td style={{ fontWeight: 700 }}>{holding.shares} sh</td>

          {/* 3. Avg Cost */}
          <td style={{ color: 'var(--text-muted)' }}>@{currencySymbol}{avgCostConverted}</td>

          {/* 4. Price */}
          <td>
            {stats ? `${currencySymbol}${currentPriceConverted?.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
          </td>

          {/* 5. Market Value */}
          <td style={{ fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>
            {stats ? `${currencySymbol}${valueConverted?.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
          </td>

          {/* 6. Weight % & Target % */}
          <td style={{ color: '#fcd34d', fontWeight: 600 }}>
            {stats ? (
              <>
                {stats.current_pct.toFixed(1)}%
                {stats.target_pct !== null && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '4px' }}>
                    (target {stats.target_pct.toFixed(1)}%)
                  </span>
                )}
                {stats.deviation_pp !== null && (
                  <span style={{ fontSize: '0.75rem', marginLeft: '4px', color: stats.severity ? SEVERITY_COLOR[stats.severity] : 'var(--text-muted)' }}>
                    [{stats.deviation_pp >= 0 ? '+' : ''}{stats.deviation_pp.toFixed(1)}pp]
                  </span>
                )}
              </>
            ) : '—'}
          </td>

          {/* 7. P&L $ */}
          <td style={{ fontWeight: 700, color: pnlConverted !== null && pnlConverted >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {stats && pnlConverted !== null
              ? `${pnlConverted >= 0 ? '+' : ''}${currencySymbol}${pnlConverted.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
              : '—'}
          </td>

          {/* 8. P&L % */}
          <td style={{ fontWeight: 700, color: pnlPct !== null && pnlPct >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {stats && pnlPct !== null ? `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%` : '—'}
          </td>

          {/* 9. Status Badge */}
          <td style={{ textAlign: 'center' }}>
            {stats?.severity ? (
              <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                {SEVERITY_LABEL[stats.severity]}
              </span>
            ) : '—'}
          </td>

          {/* 10. Actions */}
          <td style={{ textAlign: 'right' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
              {stats && (
                <button
                  type="button"
                  onClick={() => setCalculatorsOpen((open) => !open)}
                  style={{ padding: '4px 10px', fontSize: '0.75rem', borderColor: 'var(--primary)', color: 'var(--primary)', whiteSpace: 'nowrap' }}
                >
                  {calculatorsOpen ? 'Hide calculators' : 'Calculate'}
                </button>
              )}
              <button
                type="button"
                onClick={() => onDelete(holding.id)}
                style={{ padding: '4px 10px', fontSize: '0.75rem', borderColor: 'var(--red)', color: 'var(--red)', whiteSpace: 'nowrap' }}
              >
                Delete
              </button>
            </div>
          </td>
        </tr>

        {/* Calculator Drawer Row */}
        {stats && calculatorsOpen && (
          <tr>
            <td colSpan={10} style={{ padding: '12px', background: 'rgba(15, 23, 42, 0.6)', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                <div style={{ background: 'rgba(99,102,241,0.08)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(99,102,241,0.2)' }}>
                  <DcaCalculator currentShares={holding.shares} currentAvgCostUsd={holding.avg_cost_usd} currentPriceUsd={stats.current_price} currencyMultiplier={currencyMultiplier} currencySymbol={currencySymbol} />
                </div>
                <div style={{ background: 'rgba(245,158,11,0.08)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <StressTestCalculator currentPriceUsd={stats.current_price} />
                </div>
              </div>
            </td>
          </tr>
        )}
      </>
    );
  }

  // Card mode (default for single row rendering or non-table containers)
  return (
    <div
      className="holding-row"
      style={{
        background: 'rgba(13, 19, 34, 0.95)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '12px 16px',
        marginBottom: 10,
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '12px', alignItems: 'center' }}>
        {/* Ticker & Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {stats && (
            <span
              data-testid="severity-indicator"
              data-severity={stats.severity ?? 'none'}
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: '50%',
                flexShrink: 0,
                backgroundColor: stats.severity !== null ? SEVERITY_COLOR[stats.severity] : 'transparent',
              }}
            />
          )}
          <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--primary)', fontFamily: 'Outfit, sans-serif' }}>
            {holding.ticker}
          </span>
        </div>

        {/* Shares */}
        <div>
          <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Shares</div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{holding.shares} sh</div>
        </div>

        {/* Avg Cost */}
        <div>
          <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Avg Cost</div>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-muted)' }}>@{currencySymbol}{avgCostConverted}</div>
        </div>

        {/* Current Price */}
        {stats && (
          <div>
            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Price</div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
              {currencySymbol}{currentPriceConverted?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
          </div>
        )}

        {/* Market Value */}
        {stats && (
          <div>
            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Market Value</div>
            <div style={{ fontWeight: 800, fontSize: '1rem', fontFamily: 'Outfit, sans-serif', color: '#f8fafc' }}>
              {currencySymbol}{valueConverted?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
          </div>
        )}

        {/* Weight & Target & Deviation */}
        {stats && (
          <div>
            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Weight %</div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fcd34d' }}>
              {stats.current_pct.toFixed(1)}%
              {stats.target_pct !== null && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '4px' }}>
                  (target {stats.target_pct.toFixed(1)}%)
                </span>
              )}
              {stats.deviation_pp !== null && (
                <span style={{ fontSize: '0.75rem', marginLeft: '4px', color: stats.severity ? SEVERITY_COLOR[stats.severity] : 'var(--text-muted)' }}>
                  [{stats.deviation_pp >= 0 ? '+' : ''}{stats.deviation_pp.toFixed(1)}pp]
                </span>
              )}
            </div>
          </div>
        )}

        {/* Unrealized P&L */}
        {stats && pnlConverted !== null && (
          <div>
            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Unrealized P&L</div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: isProfit ? 'var(--green)' : 'var(--red)' }}>
              {isProfit ? '+' : ''}{currencySymbol}{pnlConverted.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              {pnlPct !== null && (
                <span style={{ fontSize: '0.78rem', marginLeft: '4px' }}>
                  ({isProfit ? '+' : ''}{pnlPct.toFixed(2)}%)
                </span>
              )}
            </div>
          </div>
        )}

        {/* Status Badge */}
        <div>
          <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Status</div>
          <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>
            {stats?.severity ? SEVERITY_LABEL[stats.severity] : '—'}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
          {stats && (
            <button
              type="button"
              onClick={() => setCalculatorsOpen((open) => !open)}
              style={{ padding: '5px 12px', fontSize: '0.8rem', borderColor: 'var(--primary)', color: 'var(--primary)', whiteSpace: 'nowrap' }}
            >
              {calculatorsOpen ? 'Hide calculators' : 'Calculate'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete(holding.id)}
            style={{ padding: '5px 12px', fontSize: '0.8rem', borderColor: 'var(--red)', color: 'var(--red)', whiteSpace: 'nowrap' }}
          >
            Delete
          </button>
        </div>
      </div>

      {/* Inline Calculators Drawer */}
      {stats && calculatorsOpen && (
        <div
          style={{
            marginTop: '12px',
            paddingTop: '12px',
            borderTop: '1px solid var(--border)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '12px',
          }}
        >
          <div style={{ background: 'rgba(99,102,241,0.08)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(99,102,241,0.2)' }}>
            <DcaCalculator currentShares={holding.shares} currentAvgCostUsd={holding.avg_cost_usd} currentPriceUsd={stats.current_price} currencyMultiplier={currencyMultiplier} currencySymbol={currencySymbol} />
          </div>
          <div style={{ background: 'rgba(245,158,11,0.08)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.2)' }}>
            <StressTestCalculator currentPriceUsd={stats.current_price} />
          </div>
        </div>
      )}
    </div>
  );
}

// frontend/src/components/PositionSizingCalculator.tsx
// wayfinder ticket 05 (ai-signal-investor-upgrades map): turns the existing entry/stop-loss
// trading setup into a concrete "how many shares" recommendation. Decisions locked before
// building (see the map's Notes): user picks which portfolio to size against, and sets a
// configurable risk-per-trade % (no hardcoded default beyond the *initial* input value).
import { useState } from 'react';
import type { Portfolio } from '../api/types';
import type { TradingSetup } from '../utils/aiTechnicalSignal';

interface PositionSizingCalculatorProps {
  portfolios: Portfolio[];
  tradingSetup: TradingSetup;
  currencySymbol: string;
  multiplier: number;
  formatNumber: (n: number) => string;
}

export function PositionSizingCalculator({ portfolios, tradingSetup, currencySymbol, multiplier, formatNumber }: PositionSizingCalculatorProps) {
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(portfolios[0]?.id ?? null);
  const [riskPct, setRiskPct] = useState(1);

  if (portfolios.length === 0) {
    return (
      <div className="glass-stat-card" style={{ marginBottom: '16px' }} data-testid="position-sizing">
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>📐</span> Position Sizing
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ยังไม่มีพอร์ต — สร้างพอร์ตก่อนเพื่อคำนวณขนาดการซื้อ</div>
      </div>
    );
  }

  const selectedPortfolio = portfolios.find((p) => p.id === selectedPortfolioId) ?? portfolios[0];
  const entryPrice = tradingSetup.entryZone.max;
  const stopLossPrice = tradingSetup.stopLoss.price;
  const riskPerShare = entryPrice - stopLossPrice;

  // Guard: calcTradingSetup already clamps stop-loss below entry, but this component doesn't
  // trust that blindly (per the ticket) -- a zero/negative risk-per-share means "can't size this
  // safely," shown as "-", never a divide-by-zero Infinity/NaN.
  const canSize = riskPerShare > 0 && entryPrice > 0 && selectedPortfolio !== undefined;
  const riskAmountUsd = canSize ? selectedPortfolio!.cash_usd * (riskPct / 100) : 0;
  const shares = canSize ? Math.floor(riskAmountUsd / riskPerShare) : 0;
  const totalCostUsd = shares * entryPrice;

  return (
    <div className="glass-stat-card" style={{ marginBottom: '16px' }} data-testid="position-sizing">
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span>📐</span> Position Sizing
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px', fontSize: '0.8rem' }}>
        <label htmlFor="position-sizing-portfolio" style={{ color: 'var(--text-muted)' }}>
          พอร์ต:
        </label>
        <select
          id="position-sizing-portfolio"
          value={selectedPortfolio?.id ?? ''}
          onChange={(e) => setSelectedPortfolioId(Number(e.target.value))}
        >
          {portfolios.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} (${formatNumber(p.cash_usd)})
            </option>
          ))}
        </select>

        <label htmlFor="position-sizing-risk-pct" style={{ color: 'var(--text-muted)' }}>
          เสี่ยงต่อครั้ง:
        </label>
        <input
          id="position-sizing-risk-pct"
          type="number"
          min={0.1}
          max={100}
          step={0.1}
          value={riskPct}
          onChange={(e) => setRiskPct(Math.max(0.1, Number(e.target.value) || 0))}
          style={{ width: '64px' }}
        />
        <span style={{ color: 'var(--text-muted)' }}>%</span>
      </div>

      {canSize ? (
        <div style={{ fontSize: '0.85rem' }}>
          <div style={{ fontWeight: 700, color: '#38bdf8', fontFamily: 'Outfit, sans-serif' }}>
            แนะนำซื้อ ~{shares.toLocaleString()} หุ้น
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '2px' }}>
            ใช้เงินประมาณ {currencySymbol}{formatNumber(totalCostUsd * multiplier)} · เสี่ยงสูงสุด {currencySymbol}
            {formatNumber(riskAmountUsd * multiplier)} ({riskPct}% ของเงินสด {selectedPortfolio!.name})
          </div>
        </div>
      ) : (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          คำนวณไม่ได้ — {entryPrice <= 0 ? 'ยังไม่มีราคาซื้อ' : 'จุดตัดขาดทุนไม่ต่ำกว่าราคาซื้อ'}
        </div>
      )}
    </div>
  );
}

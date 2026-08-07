// frontend/src/components/PositionWidget.tsx
// wethaiinvest.com Widget 5: จัดการพอร์ต (Portfolio Position Manager)
// Shows the position details for the currently selected ticker.
import { useEffect, useState } from 'react';
import { getTickerPosition } from '../api/client';
import type { TickerPosition } from '../api/client';

interface PositionWidgetProps {
  ticker: string;
  currencyMultiplier: number;
  currencySymbol: string;
}

export function PositionWidget({ ticker, currencyMultiplier, currencySymbol }: PositionWidgetProps) {
  const [position, setPosition] = useState<TickerPosition | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setPosition(null);
    getTickerPosition(ticker)
      .then(setPosition)
      .catch(() => setPosition(null))
      .finally(() => setLoading(false));
  }, [ticker]);

  if (loading) {
    return (
      <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(15,23,42,0.7)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        Loading position data…
      </div>
    );
  }

  if (!position) {
    return (
      <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(15,23,42,0.5)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        📋 คุณยังไม่มีหุ้น <strong style={{ color: 'var(--primary)' }}>{ticker}</strong> ในพอร์ต — <a href="#portfolios" style={{ color: 'var(--primary)' }}>เพิ่มหุ้นในพอร์ต</a>
      </div>
    );
  }

  const isProfit = (position.unrealized_pnl_usd ?? 0) >= 0;
  const pnlColor = isProfit ? 'var(--green)' : 'var(--red)';
  const pnlEmoji = isProfit ? '😚' : '😢';

  const formatMoney = (v: number | null) => (v === null ? '—' : `${currencySymbol}${(v * currencyMultiplier).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

  return (
    <div style={{
      borderRadius: '12px',
      background: 'rgba(15, 23, 42, 0.85)',
      border: '1px solid var(--border)',
      overflow: 'hidden',
      marginTop: '4px',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        background: 'rgba(56, 189, 248, 0.08)',
        borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--primary)' }}>💼 จัดการพอร์ต — {ticker}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{position.portfolio_name}</span>
      </div>

      {/* Position Data Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0', padding: '0' }}>
        <div style={{ padding: '12px 16px', borderRight: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}>จำนวนหุ้น (Shares)</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}>{position.shares.toFixed(4)}</div>
        </div>
        <div style={{ padding: '12px 16px', borderRight: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}>ต้นทุนเฉลี่ย (Avg Cost)</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}>{formatMoney(position.avg_cost_usd)}</div>
        </div>
        <div style={{ padding: '12px 16px', borderRight: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}>มูลค่าตลาด (Market Value)</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif' }}>{formatMoney(position.market_value_usd)}</div>
        </div>
        <div style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}>กำไร/ขาดทุน {pnlEmoji}</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'Outfit, sans-serif', color: pnlColor }}>
            {isProfit ? '+' : ''}{formatMoney(position.unrealized_pnl_usd)}
            {position.unrealized_pnl_pct !== null && (
              <span style={{ fontSize: '0.85rem', marginLeft: '6px' }}>
                ({isProfit ? '+' : ''}{position.unrealized_pnl_pct.toFixed(2)}%)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px' }}>
        <button
          type="button"
          style={{ fontSize: '0.8rem', padding: '5px 14px', borderColor: 'var(--primary)', color: 'var(--primary)' }}
          onClick={() => window.location.hash = '#portfolios'}
        >
          แก้ไขหุ้นในพอร์ต
        </button>
      </div>
    </div>
  );
}

// frontend/src/components/PortfolioCard.tsx
import type { Portfolio } from '../api/types';
import { usePortfolioSummary } from '../hooks/usePortfolioSummary';

interface PortfolioCardProps {
  portfolio: Portfolio;
  onDelete: (id: number) => void;
  onToggleHoldings: (id: number) => void;
  expanded: boolean;
  currencyMultiplier?: number;
  currencySymbol?: string;
}

export function PortfolioCard({
  portfolio,
  onDelete,
  onToggleHoldings,
  expanded,
  currencyMultiplier = 1,
  currencySymbol = '$',
}: PortfolioCardProps) {
  const { summary, loading, error } = usePortfolioSummary(portfolio.id);
  const needsRebalanceCount = summary
    ? summary.holdings.filter((h) => h.severity === 'yellow' || h.severity === 'red').length
    : 0;

  const totalVal = summary ? summary.total_value * currencyMultiplier : portfolio.cash_usd * currencyMultiplier;
  const pnlVal = summary ? summary.unrealized_pnl * currencyMultiplier : 0;

  return (
    <div className="portfolio-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Portfolio Title Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '1.25rem' }}>💼</span>
          <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: 'var(--text)' }}>{portfolio.name}</h3>
          <span className="badge badge-blue" style={{ fontSize: '0.75rem' }}>
            Target allocation: {portfolio.target_allocation_pct === null ? 'no target set' : `${portfolio.target_allocation_pct}%`}
          </span>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => onToggleHoldings(portfolio.id)}
            style={{
              padding: '6px 14px',
              fontSize: '0.85rem',
              borderColor: 'var(--primary)',
              color: 'var(--primary)',
              fontWeight: 600,
            }}
          >
            {expanded ? 'Hide holdings' : 'Show holdings'}
          </button>
          <button
            type="button"
            onClick={() => onDelete(portfolio.id)}
            style={{
              padding: '6px 14px',
              fontSize: '0.85rem',
              borderColor: 'var(--red)',
              color: 'var(--red)',
              fontWeight: 600,
            }}
          >
            Delete
          </button>
        </div>
      </div>

      {loading && <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading value…</div>}
      {error && <div role="alert">{error}</div>}

      {summary && (
        <div style={{ display: 'flex', gap: '20px', alignItems: 'baseline', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>
            Total value: {currencySymbol}{totalVal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>

          <div
            style={{
              color: summary.unrealized_pnl >= 0 ? 'var(--green)' : 'var(--red)',
              fontWeight: 700,
              fontSize: '1.05rem',
            }}
          >
            Unrealized P&amp;L: {currencySymbol}{pnlVal.toLocaleString(undefined, { maximumFractionDigits: 2 })}{' '}
            {summary.unrealized_pnl >= 0 ? '😊' : '😟'}
          </div>

          {needsRebalanceCount > 0 && (
            <div
              role="status"
              className="badge badge-amber"
              style={{ padding: '4px 10px', fontSize: '0.8rem', fontWeight: 600 }}
            >
              ⚠️ {needsRebalanceCount} holding{needsRebalanceCount === 1 ? '' : 's'} need{needsRebalanceCount === 1 ? 's' : ''} rebalancing
            </div>
          )}
        </div>
      )}
    </div>
  );
}

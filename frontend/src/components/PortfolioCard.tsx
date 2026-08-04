import type { Portfolio } from '../api/types';
import { usePortfolioSummary } from '../hooks/usePortfolioSummary';

interface PortfolioCardProps {
  portfolio: Portfolio;
  onDelete: (id: number) => void;
  onToggleHoldings: (id: number) => void;
  expanded: boolean;
}

export function PortfolioCard({ portfolio, onDelete, onToggleHoldings, expanded }: PortfolioCardProps) {
  const { summary, loading, error } = usePortfolioSummary(portfolio.id);
  const needsRebalanceCount = summary
    ? summary.holdings.filter((h) => h.severity === 'yellow' || h.severity === 'red').length
    : 0;

  return (
    <div className="portfolio-card">
      <h3>{portfolio.name}</h3>
      {loading && <div>Loading value…</div>}
      {error && <div role="alert">{error}</div>}
      {summary && (
        <>
          <div>Total value: ${summary.total_value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          <div style={{ color: summary.unrealized_pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
            Unrealized P&amp;L: ${summary.unrealized_pnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}{' '}
            {summary.unrealized_pnl >= 0 ? '😊' : '😟'}
          </div>
          {needsRebalanceCount > 0 && (
            <div role="status">
              {needsRebalanceCount} holding{needsRebalanceCount === 1 ? '' : 's'} need{needsRebalanceCount === 1 ? 's' : ''} rebalancing
            </div>
          )}
        </>
      )}
      <div>
        Target allocation: {portfolio.target_allocation_pct === null ? 'no target set' : `${portfolio.target_allocation_pct}%`}
      </div>
      <button onClick={() => onToggleHoldings(portfolio.id)}>{expanded ? 'Hide holdings' : 'Show holdings'}</button>
      <button onClick={() => onDelete(portfolio.id)} style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
        Delete
      </button>
    </div>
  );
}

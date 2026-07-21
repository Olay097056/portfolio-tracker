import type { Portfolio } from '../api/types';

interface PortfolioCardProps {
  portfolio: Portfolio;
  onDelete: (id: number) => void;
  onToggleHoldings: (id: number) => void;
  expanded: boolean;
}

export function PortfolioCard({ portfolio, onDelete, onToggleHoldings, expanded }: PortfolioCardProps) {
  return (
    <div className="portfolio-card">
      <h3>{portfolio.name}</h3>
      <div>Cash: ${portfolio.cash_usd.toLocaleString()}</div>
      <div>
        Target allocation: {portfolio.target_allocation_pct === null ? 'no target set' : `${portfolio.target_allocation_pct}%`}
      </div>
      <button onClick={() => onToggleHoldings(portfolio.id)}>{expanded ? 'Hide holdings' : 'Show holdings'}</button>
      <button onClick={() => onDelete(portfolio.id)}>Delete</button>
    </div>
  );
}

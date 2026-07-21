import type { Holding, HoldingStats } from '../api/types';

interface HoldingRowProps {
  holding: Holding;
  onDelete: (id: number) => void;
  stats?: HoldingStats;
}

export function HoldingRow({ holding, onDelete, stats }: HoldingRowProps) {
  return (
    <div className="holding-row">
      <span>{holding.ticker}</span>
      <span>{holding.shares} sh</span>
      <span>@ ${holding.avg_cost_usd}</span>
      {stats && (
        <>
          <span data-testid="severity-indicator" data-severity={stats.severity ?? 'none'} />
          <span>${stats.current_price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          <span>${stats.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        </>
      )}
      <button onClick={() => onDelete(holding.id)}>Delete</button>
    </div>
  );
}

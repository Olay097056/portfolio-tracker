import type { Holding } from '../api/types';

interface HoldingRowProps {
  holding: Holding;
  onDelete: (id: number) => void;
}

export function HoldingRow({ holding, onDelete }: HoldingRowProps) {
  return (
    <div className="holding-row">
      <span>{holding.ticker}</span>
      <span>{holding.shares} sh</span>
      <span>@ ${holding.avg_cost_usd}</span>
      <button onClick={() => onDelete(holding.id)}>Delete</button>
    </div>
  );
}

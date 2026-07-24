import { useState } from 'react';
import type { Holding, HoldingStats } from '../api/types';
import { DcaCalculator } from './DcaCalculator';
import { StressTestCalculator } from './StressTestCalculator';

interface HoldingRowProps {
  holding: Holding;
  onDelete: (id: number) => void;
  stats?: HoldingStats;
}

export function HoldingRow({ holding, onDelete, stats }: HoldingRowProps) {
  const [calculatorsOpen, setCalculatorsOpen] = useState(false);

  return (
    <div className="holding-row">
      <div>
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
        {stats && (
          <button onClick={() => setCalculatorsOpen((open) => !open)}>
            {calculatorsOpen ? 'Hide calculators' : 'Calculate'}
          </button>
        )}
        <button onClick={() => onDelete(holding.id)}>Delete</button>
      </div>
      {stats && calculatorsOpen && (
        <div>
          <DcaCalculator currentShares={holding.shares} currentAvgCostUsd={holding.avg_cost_usd} currentPriceUsd={stats.current_price} />
          <StressTestCalculator currentPriceUsd={stats.current_price} />
        </div>
      )}
    </div>
  );
}

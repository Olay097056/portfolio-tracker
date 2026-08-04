import { useState } from 'react';
import type { Holding, HoldingStats } from '../api/types';
import { DcaCalculator } from './DcaCalculator';
import { StressTestCalculator } from './StressTestCalculator';

// Local mapping, not a shared module like zoneStyle.ts — exactly three theme tokens consumed
// in exactly one place. A shared module would be premature for a single consumer.
const SEVERITY_COLOR: Record<'green' | 'yellow' | 'red', string> = {
  green: 'var(--green)',
  yellow: 'var(--yellow)',
  red: 'var(--red)',
};

interface HoldingRowProps {
  holding: Holding;
  onDelete: (id: number) => void;
  stats?: HoldingStats;
}

export function HoldingRow({ holding, onDelete, stats }: HoldingRowProps) {
  const [calculatorsOpen, setCalculatorsOpen] = useState(false);

  return (
    <div className="holding-row" style={{ background: 'var(--panel3)', borderRadius: 8, padding: 8, marginBottom: 8 }}>
      <div>
        <span>{holding.ticker}</span>
        <span>{holding.shares} sh</span>
        <span>@ ${holding.avg_cost_usd}</span>
        {stats && (
          <>
            <span
              data-testid="severity-indicator"
              data-severity={stats.severity ?? 'none'}
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: '50%',
                marginRight: 6,
                // Never fabricate a color for a holding with no computed severity.
                backgroundColor: stats.severity !== null ? SEVERITY_COLOR[stats.severity] : 'transparent',
              }}
            />
            <span>${stats.current_price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            <span>${stats.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </>
        )}
        {stats && (
          <button onClick={() => setCalculatorsOpen((open) => !open)}>
            {calculatorsOpen ? 'Hide calculators' : 'Calculate'}
          </button>
        )}
        <button onClick={() => onDelete(holding.id)} style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          Delete
        </button>
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

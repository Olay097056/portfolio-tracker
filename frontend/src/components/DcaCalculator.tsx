// frontend/src/components/DcaCalculator.tsx
import { useState } from 'react';
import { calculateDca } from '../utils/dca';
import { DcaProjectionCalculator, type DcaProjectionCalculatorProps } from './DcaProjectionCalculator';

export interface DcaCalculatorProps extends DcaProjectionCalculatorProps {
  currentShares?: number;
  currentAvgCostUsd?: number;
  currentPriceUsd?: number;
  currencyMultiplier?: number;
  currencySymbol?: string;
}

export { DcaProjectionCalculator };

export function DcaCalculator(props: DcaCalculatorProps) {
  const {
    currentShares,
    currentAvgCostUsd,
    currentPriceUsd,
    currencyMultiplier = 1,
    currencySymbol = '$',
    ...projectionProps
  } = props;

  const [investment, setInvestment] = useState('');

  if (currentShares !== undefined && currentAvgCostUsd !== undefined && currentPriceUsd !== undefined) {
    const additionalInvestmentUsd = investment === '' ? 0 : Number(investment) / currencyMultiplier;
    const result = calculateDca({
      currentShares,
      currentAvgCostUsd,
      additionalInvestmentUsd,
      currentPriceUsd,
    });

    const newAvgCostConverted = result.newAvgCostUsd * currencyMultiplier;
    const newTotalCostConverted = result.newTotalCostUsd * currencyMultiplier;

    return (
      <div className="card glass-panel">
        <h4 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>DCA calculator</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label htmlFor="dca-investment" style={{ fontSize: '0.88rem', fontWeight: 600 }}>
            Add investment ({currencySymbol === '$' ? 'USD' : currencySymbol})
          </label>
          <input
            id="dca-investment"
            type="number"
            value={investment}
            onChange={(e) => setInvestment(e.target.value)}
            className="glass-input"
            style={{ width: '100%', padding: '8px 12px' }}
          />
          <div style={{ fontSize: '0.9rem' }}>New average cost: {currencySymbol}{newAvgCostConverted.toFixed(2)}</div>
          <div style={{ fontSize: '0.9rem' }}>New shares: {result.newShares.toFixed(2)}</div>
          <div style={{ fontSize: '0.9rem' }}>New total cost: {currencySymbol}{newTotalCostConverted.toFixed(2)}</div>
        </div>
      </div>
    );
  }

  return <DcaProjectionCalculator {...projectionProps} />;
}


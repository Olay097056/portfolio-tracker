import { useState } from 'react';
import { calculateDca } from '../utils/dca';

interface DcaCalculatorProps {
  currentShares: number;
  currentAvgCostUsd: number;
  currentPriceUsd: number;
}

export function DcaCalculator({ currentShares, currentAvgCostUsd, currentPriceUsd }: DcaCalculatorProps) {
  const [investment, setInvestment] = useState('');

  const additionalInvestmentUsd = investment === '' ? 0 : Number(investment);
  const result = calculateDca({
    currentShares,
    currentAvgCostUsd,
    additionalInvestmentUsd,
    currentPriceUsd,
  });

  return (
    <div>
      <h4>DCA calculator</h4>
      <label htmlFor="dca-investment">Add investment (USD)</label>
      <input id="dca-investment" type="number" value={investment} onChange={(e) => setInvestment(e.target.value)} />
      <div>New average cost: ${result.newAvgCostUsd.toFixed(2)}</div>
      <div>New shares: {result.newShares.toFixed(2)}</div>
      <div>New total cost: ${result.newTotalCostUsd.toFixed(2)}</div>
    </div>
  );
}

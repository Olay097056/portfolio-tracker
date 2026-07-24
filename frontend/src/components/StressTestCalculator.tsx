import { useState } from 'react';
import { calculateStressTest } from '../utils/stressTest';

interface StressTestCalculatorProps {
  currentPriceUsd: number;
}

export function StressTestCalculator({ currentPriceUsd }: StressTestCalculatorProps) {
  const [investment, setInvestment] = useState('');
  const [targetPrice, setTargetPrice] = useState('');

  const investmentUsd = investment === '' ? 0 : Number(investment);
  const customTargetPriceUsd = targetPrice === '' ? undefined : Number(targetPrice);
  const scenarios = calculateStressTest({ investmentUsd, currentPriceUsd, customTargetPriceUsd });

  return (
    <div>
      <h4>Stress test</h4>
      <label htmlFor="stress-investment">Investment amount (USD)</label>
      <input id="stress-investment" type="number" value={investment} onChange={(e) => setInvestment(e.target.value)} />

      <label htmlFor="stress-target-price">Target price (USD, optional)</label>
      <input id="stress-target-price" type="number" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} />

      {scenarios.map((scenario) => (
        <div key={scenario.label}>
          <span>{scenario.label}</span>
          <span> (${scenario.targetPriceUsd.toFixed(2)})</span>
          <span> remaining: ${scenario.remainingValueUsd.toFixed(2)}</span>
          <span> lost: ${scenario.moneyLostUsd.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

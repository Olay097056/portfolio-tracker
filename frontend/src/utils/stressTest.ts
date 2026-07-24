export interface StressTestInput {
  investmentUsd: number;
  currentPriceUsd: number;
  customTargetPriceUsd?: number;
}

export interface StressTestScenario {
  label: string;
  targetPriceUsd: number;
  remainingValueUsd: number;
  moneyLostUsd: number;
}

const FIXED_DROP_PCTS = [-5, -10, -20];

function buildScenario(label: string, targetPriceUsd: number, investmentUsd: number, currentPriceUsd: number): StressTestScenario {
  const shares = currentPriceUsd > 0 ? investmentUsd / currentPriceUsd : 0;
  const remainingValueUsd = shares * targetPriceUsd;
  const moneyLostUsd = investmentUsd - remainingValueUsd;
  return { label, targetPriceUsd, remainingValueUsd, moneyLostUsd };
}

export function calculateStressTest(input: StressTestInput): StressTestScenario[] {
  const { investmentUsd, currentPriceUsd, customTargetPriceUsd } = input;

  const scenarios = FIXED_DROP_PCTS.map((pct) => {
    const targetPriceUsd = currentPriceUsd * (1 + pct / 100);
    return buildScenario(`${pct}%`, targetPriceUsd, investmentUsd, currentPriceUsd);
  });

  if (customTargetPriceUsd !== undefined) {
    scenarios.push(buildScenario('Custom', customTargetPriceUsd, investmentUsd, currentPriceUsd));
  }

  return scenarios;
}

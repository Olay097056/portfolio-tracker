export interface DcaInput {
  currentShares: number;
  currentAvgCostUsd: number;
  additionalInvestmentUsd: number;
  currentPriceUsd: number;
}

export interface DcaResult {
  newShares: number;
  newAvgCostUsd: number;
  newTotalCostUsd: number;
}

export function calculateDca(input: DcaInput): DcaResult {
  const { currentShares, currentAvgCostUsd, additionalInvestmentUsd, currentPriceUsd } = input;

  const additionalShares = currentPriceUsd > 0 ? additionalInvestmentUsd / currentPriceUsd : 0;
  const newShares = currentShares + additionalShares;
  const newTotalCostUsd = currentShares * currentAvgCostUsd + additionalInvestmentUsd;
  const newAvgCostUsd = newShares > 0 ? newTotalCostUsd / newShares : 0;

  return { newShares, newAvgCostUsd, newTotalCostUsd };
}

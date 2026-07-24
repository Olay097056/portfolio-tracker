export interface DcaProjectionInput {
  initialInvestmentThb: number;
  monthlyContributionThb: number;
  years: number;
  dividendYieldPct: number;
  priceGrowthRatePct: number;
  reinvestDividends: boolean;
  taxRatePct: number;
}

export interface DcaProjectionYear {
  year: number;
  totalInvestedThb: number;
  portfolioValueThb: number;
  netMonthlyDividendThb: number;
  monthlyCapitalGainThb: number;
}

export function calculateDcaProjection(input: DcaProjectionInput): DcaProjectionYear[] {
  const {
    initialInvestmentThb,
    monthlyContributionThb,
    years,
    dividendYieldPct,
    priceGrowthRatePct,
    reinvestDividends,
    taxRatePct,
  } = input;

  const grossYield = dividendYieldPct / 100;
  const netYield = grossYield * (1 - taxRatePct / 100);
  const growthRate = priceGrowthRatePct / 100;

  const monthlyYield = netYield / 12;
  const monthlyGrowth = growthRate / 12;
  const monthlyReturn = reinvestDividends ? monthlyGrowth + monthlyYield : monthlyGrowth;

  let currentPortfolio = initialInvestmentThb;
  let totalInvested = initialInvestmentThb;

  const results: DcaProjectionYear[] = [];

  for (let year = 1; year <= years; year++) {
    for (let month = 1; month <= 12; month++) {
      currentPortfolio += monthlyContributionThb;
      totalInvested += monthlyContributionThb;
      currentPortfolio *= 1 + monthlyReturn;
    }

    const netMonthlyDividendThb = (currentPortfolio * netYield) / 12;
    const monthlyCapitalGainThb = (currentPortfolio * growthRate) / 12;

    results.push({
      year,
      totalInvestedThb: totalInvested,
      portfolioValueThb: currentPortfolio,
      netMonthlyDividendThb,
      monthlyCapitalGainThb,
    });
  }

  return results;
}

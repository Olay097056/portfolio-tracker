import { calculateDcaProjection, type DcaProjectionInput } from './dcaProjection';

export interface PassiveIncomeInput {
  targetMonthlyIncomeThb: number;
  initialInvestmentThb: number;
  monthlyContributionThb: number;
  dividendYieldPct: number;
  priceGrowthRatePct: number;
  taxRatePct: number;
}

export interface PassiveIncomeYearProgress {
  year: number;
  portfolioValueThb: number;
  monthlyDividendThb: number;
  progressPct: number;
}

export interface PassiveIncomeResult {
  requiredPortfolioThb: number;
  yearsToTarget: number;
  isAchievableWithin30Years: boolean;
  yearlyProjection: PassiveIncomeYearProgress[];
}

const MAX_YEARS = 30;

export function calculateRequiredPortfolio(input: PassiveIncomeInput): PassiveIncomeResult {
  const {
    targetMonthlyIncomeThb,
    initialInvestmentThb,
    monthlyContributionThb,
    dividendYieldPct,
    priceGrowthRatePct,
    taxRatePct,
  } = input;

  const netYield = (dividendYieldPct / 100) * (1 - taxRatePct / 100);
  const requiredAnnualNetDividendThb = targetMonthlyIncomeThb * 12;
  const requiredPortfolioThb = netYield > 0 ? requiredAnnualNetDividendThb / netYield : 0;

  const dcaResults = calculateDcaProjection({
    initialInvestmentThb,
    monthlyContributionThb,
    years: MAX_YEARS,
    dividendYieldPct,
    priceGrowthRatePct,
    reinvestDividends: true,
    taxRatePct,
  } as DcaProjectionInput);

  let yearsToTarget = -1;
  const yearlyProjection: PassiveIncomeYearProgress[] = dcaResults.map((res) => {
    const progressPct =
      targetMonthlyIncomeThb > 0 ? Math.min(100, (res.netMonthlyDividendThb / targetMonthlyIncomeThb) * 100) : 0;
    if (yearsToTarget === -1 && res.netMonthlyDividendThb >= targetMonthlyIncomeThb) {
      yearsToTarget = res.year;
    }
    return {
      year: res.year,
      portfolioValueThb: res.portfolioValueThb,
      monthlyDividendThb: res.netMonthlyDividendThb,
      progressPct,
    };
  });

  return {
    requiredPortfolioThb,
    yearsToTarget: yearsToTarget !== -1 ? yearsToTarget : MAX_YEARS,
    isAchievableWithin30Years: yearsToTarget !== -1,
    yearlyProjection,
  };
}

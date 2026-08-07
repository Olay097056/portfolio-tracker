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
  annualContributionThb: number;
  portfolioValueThb: number;
  grossAnnualDividendThb: number;
  annualTaxWithheldThb: number;
  netAnnualDividendThb: number;
  netMonthlyDividendThb: number;
  monthlyCapitalGainThb: number;
}

// Field names here deliberately match the backend's DcaChartPoint/DcaYearlyMilestone
// Pydantic schemas exactly (portfolio_value/total_invested, not balance/invested or
// total_portfolio_value) -- this is the client-side fallback used interchangeably with
// the real API response (see DcaProjectionCalculator's `apiResult?.chart_data ?? clientProjection.chartData`),
// so a naming mismatch here silently breaks the chart/milestones whenever the API succeeds.
export interface DcaChartPoint {
  year: number;
  portfolio_value: number;
  total_invested: number;
}

export interface DcaYearlyMilestone {
  year: number;
  portfolio_value: number;
  total_invested: number;
  monthly_dividend: number;
  monthly_growth: number;
  monthly_total: number;
}

export interface DcaFullProjectionResult {
  finalPortfolioValue: number;
  multiplier: number;
  totalInvested: number;
  accumulatedDividend: number;
  capitalGain: number;
  totalReturn: number;
  taxAmount: number;
  finalMonthlyDividend: number;
  finalMonthlyGrowth: number;
  finalMonthlyTotal: number;
  chartData: DcaChartPoint[];
  yearlyMilestones: DcaYearlyMilestone[];
  yearlyBreakdown: DcaProjectionYear[];
}

export function calculateDcaProjectionFull(input: DcaProjectionInput): DcaFullProjectionResult {
  const {
    initialInvestmentThb,
    monthlyContributionThb,
    years,
    dividendYieldPct,
    priceGrowthRatePct,
    reinvestDividends,
    taxRatePct,
  } = input;

  const grossYield = Math.max(0, dividendYieldPct) / 100;
  const taxRate = Math.max(0, taxRatePct) / 100;
  const netYield = grossYield * (1 - taxRate);
  const growthRate = Math.max(0, priceGrowthRatePct) / 100;

  const monthlyGrossYield = grossYield / 12;
  const monthlyNetYield = netYield / 12;
  const monthlyGrowth = growthRate / 12;
  const monthlyReturn = reinvestDividends ? monthlyGrowth + monthlyNetYield : monthlyGrowth;

  let currentPortfolio = initialInvestmentThb;
  let totalInvested = initialInvestmentThb;
  let accumulatedNetDividend = 0;
  let totalTaxWithheld = 0;

  const yearlyBreakdown: DcaProjectionYear[] = [];
  const chartData: DcaChartPoint[] = [];
  const yearlyMilestones: DcaYearlyMilestone[] = [];

  const targetYears = Math.max(0, Math.min(30, Math.round(years)));

  for (let year = 1; year <= targetYears; year++) {
    const annualContribution = year === 1 ? initialInvestmentThb + monthlyContributionThb * 12 : monthlyContributionThb * 12;
    let annualGrossDividend = 0;
    let annualTaxWithheld = 0;

    for (let month = 1; month <= 12; month++) {
      currentPortfolio += monthlyContributionThb;
      totalInvested += monthlyContributionThb;

      const monthGrossDividend = currentPortfolio * monthlyGrossYield;
      const monthTaxWithheld = monthGrossDividend * taxRate;
      const monthNetDividend = monthGrossDividend - monthTaxWithheld;

      annualGrossDividend += monthGrossDividend;
      annualTaxWithheld += monthTaxWithheld;
      accumulatedNetDividend += monthNetDividend;
      totalTaxWithheld += monthTaxWithheld;

      currentPortfolio *= 1 + monthlyReturn;
    }

    const netMonthlyDividendThb = (currentPortfolio * netYield) / 12;
    const monthlyCapitalGainThb = (currentPortfolio * growthRate) / 12;
    const monthlyTotalThb = netMonthlyDividendThb + monthlyCapitalGainThb;

    yearlyBreakdown.push({
      year,
      totalInvestedThb: totalInvested,
      annualContributionThb: annualContribution,
      portfolioValueThb: currentPortfolio,
      grossAnnualDividendThb: annualGrossDividend,
      annualTaxWithheldThb: annualTaxWithheld,
      netAnnualDividendThb: annualGrossDividend - annualTaxWithheld,
      netMonthlyDividendThb,
      monthlyCapitalGainThb,
    });

    chartData.push({
      year,
      portfolio_value: Math.round(currentPortfolio),
      total_invested: Math.round(totalInvested),
    });

    yearlyMilestones.push({
      year,
      portfolio_value: currentPortfolio,
      total_invested: totalInvested,
      monthly_dividend: netMonthlyDividendThb,
      monthly_growth: monthlyCapitalGainThb,
      monthly_total: monthlyTotalThb,
    });
  }

  const finalPortfolioValue = currentPortfolio;
  const capitalGain = finalPortfolioValue - totalInvested - accumulatedNetDividend;
  const totalReturn = finalPortfolioValue - totalInvested;
  const multiplier = totalInvested > 0 ? finalPortfolioValue / totalInvested : 1.0;

  const finalMonthlyDividend = (finalPortfolioValue * netYield) / 12;
  const finalMonthlyGrowth = (finalPortfolioValue * growthRate) / 12;
  const finalMonthlyTotal = finalMonthlyDividend + finalMonthlyGrowth;

  return {
    finalPortfolioValue,
    multiplier,
    totalInvested,
    accumulatedDividend: accumulatedNetDividend,
    capitalGain,
    totalReturn,
    taxAmount: totalTaxWithheld,
    finalMonthlyDividend,
    finalMonthlyGrowth,
    finalMonthlyTotal,
    chartData,
    yearlyMilestones,
    yearlyBreakdown,
  };
}

export function calculateDcaProjection(input: DcaProjectionInput): DcaProjectionYear[] {
  return calculateDcaProjectionFull(input).yearlyBreakdown;
}


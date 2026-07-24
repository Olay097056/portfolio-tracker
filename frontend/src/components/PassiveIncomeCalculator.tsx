import { useEffect, useState } from 'react';
import { getMarketData } from '../api/client';
import type { MarketData } from '../api/types';
import { calculateRequiredPortfolio } from '../utils/passiveIncome';

export function PassiveIncomeCalculator() {
  const [ticker, setTicker] = useState('');
  const [targetMonthlyIncome, setTargetMonthlyIncome] = useState('30000');
  const [initialInvestment, setInitialInvestment] = useState('100000');
  const [monthlyContribution, setMonthlyContribution] = useState('15000');
  const [dividendYieldPct, setDividendYieldPct] = useState('');
  const [priceGrowthRatePct, setPriceGrowthRatePct] = useState('');
  const [taxRatePct, setTaxRatePct] = useState('15');

  useEffect(() => {
    const trimmed = ticker.trim().toUpperCase();
    if (!trimmed) {
      return;
    }
    let cancelled = false;
    getMarketData([trimmed])
      .then((data: Record<string, MarketData>) => {
        if (cancelled) return;
        const entry = data[trimmed];
        if (entry?.dividend_yield_pct != null) {
          setDividendYieldPct(String(entry.dividend_yield_pct.toFixed(2)));
        }
        if (entry?.growth_rate_pct != null) {
          setPriceGrowthRatePct(String(entry.growth_rate_pct.toFixed(2)));
        }
      })
      .catch(() => {
        // leave fields blank/editable on failure — never fabricate a value
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const result = calculateRequiredPortfolio({
    targetMonthlyIncomeThb: Number(targetMonthlyIncome) || 0,
    initialInvestmentThb: Number(initialInvestment) || 0,
    monthlyContributionThb: Number(monthlyContribution) || 0,
    dividendYieldPct: Number(dividendYieldPct) || 0,
    priceGrowthRatePct: Number(priceGrowthRatePct) || 0,
    taxRatePct: Number(taxRatePct) || 0,
  });

  return (
    <div>
      <h3>Passive Income</h3>
      <label htmlFor="ff-ticker">Ticker</label>
      <input id="ff-ticker" value={ticker} onChange={(e) => setTicker(e.target.value)} />

      <label htmlFor="ff-target">Target monthly income (THB)</label>
      <input
        id="ff-target"
        type="number"
        value={targetMonthlyIncome}
        onChange={(e) => setTargetMonthlyIncome(e.target.value)}
      />

      <label htmlFor="ff-initial">Initial investment (THB)</label>
      <input
        id="ff-initial"
        type="number"
        value={initialInvestment}
        onChange={(e) => setInitialInvestment(e.target.value)}
      />

      <label htmlFor="ff-monthly">Monthly contribution (THB)</label>
      <input
        id="ff-monthly"
        type="number"
        value={monthlyContribution}
        onChange={(e) => setMonthlyContribution(e.target.value)}
      />

      <label htmlFor="ff-yield">Dividend yield (%/yr)</label>
      <input id="ff-yield" type="number" value={dividendYieldPct} onChange={(e) => setDividendYieldPct(e.target.value)} />

      <label htmlFor="ff-growth">Price growth (%/yr)</label>
      <input
        id="ff-growth"
        type="number"
        value={priceGrowthRatePct}
        onChange={(e) => setPriceGrowthRatePct(e.target.value)}
      />

      <label htmlFor="ff-tax">Dividend tax rate (%)</label>
      <input id="ff-tax" type="number" value={taxRatePct} onChange={(e) => setTaxRatePct(e.target.value)} />

      <div>Required portfolio: ฿{result.requiredPortfolioThb.toFixed(0)}</div>
      <div>
        {result.isAchievableWithin30Years
          ? `Reachable in ${result.yearsToTarget} years at this contribution rate`
          : 'Not reachable within 30 years at this contribution rate'}
      </div>
    </div>
  );
}

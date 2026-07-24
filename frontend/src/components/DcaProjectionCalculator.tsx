import { useEffect, useState } from 'react';
import { getMarketData } from '../api/client';
import { calculateDcaProjection } from '../utils/dcaProjection';

export function DcaProjectionCalculator() {
  const [ticker, setTicker] = useState('');
  const [initialInvestment, setInitialInvestment] = useState('100000');
  const [monthlyContribution, setMonthlyContribution] = useState('5000');
  const [years, setYears] = useState('10');
  const [dividendYieldPct, setDividendYieldPct] = useState('');
  const [priceGrowthRatePct, setPriceGrowthRatePct] = useState('');
  const [taxRatePct, setTaxRatePct] = useState('15');
  const [reinvestDividends, setReinvestDividends] = useState(true);

  useEffect(() => {
    const trimmed = ticker.trim().toUpperCase();
    if (!trimmed) {
      return;
    }
    let cancelled = false;
    getMarketData([trimmed])
      .then((data) => {
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

  const projection = calculateDcaProjection({
    initialInvestmentThb: Number(initialInvestment) || 0,
    monthlyContributionThb: Number(monthlyContribution) || 0,
    years: Number(years) || 0,
    dividendYieldPct: Number(dividendYieldPct) || 0,
    priceGrowthRatePct: Number(priceGrowthRatePct) || 0,
    reinvestDividends,
    taxRatePct: Number(taxRatePct) || 0,
  });

  const last = projection[projection.length - 1];

  return (
    <div>
      <h3>DCA Projection</h3>
      <label htmlFor="dca-proj-ticker">Ticker</label>
      <input id="dca-proj-ticker" value={ticker} onChange={(e) => setTicker(e.target.value)} />

      <label htmlFor="dca-proj-initial">Initial investment (THB)</label>
      <input
        id="dca-proj-initial"
        type="number"
        value={initialInvestment}
        onChange={(e) => setInitialInvestment(e.target.value)}
      />

      <label htmlFor="dca-proj-monthly">Monthly contribution (THB)</label>
      <input
        id="dca-proj-monthly"
        type="number"
        value={monthlyContribution}
        onChange={(e) => setMonthlyContribution(e.target.value)}
      />

      <label htmlFor="dca-proj-years">Years</label>
      <input id="dca-proj-years" type="number" value={years} onChange={(e) => setYears(e.target.value)} />

      <label htmlFor="dca-proj-yield">Dividend yield (%/yr)</label>
      <input
        id="dca-proj-yield"
        type="number"
        value={dividendYieldPct}
        onChange={(e) => setDividendYieldPct(e.target.value)}
      />

      <label htmlFor="dca-proj-growth">Price growth (%/yr)</label>
      <input
        id="dca-proj-growth"
        type="number"
        value={priceGrowthRatePct}
        onChange={(e) => setPriceGrowthRatePct(e.target.value)}
      />

      <label htmlFor="dca-proj-tax">Dividend tax rate (%)</label>
      <input id="dca-proj-tax" type="number" value={taxRatePct} onChange={(e) => setTaxRatePct(e.target.value)} />

      <label htmlFor="dca-proj-reinvest">
        <input
          id="dca-proj-reinvest"
          type="checkbox"
          checked={reinvestDividends}
          onChange={(e) => setReinvestDividends(e.target.checked)}
        />
        Reinvest dividends
      </label>

      {last && (
        <div>
          <div>
            Portfolio value after {last.year} years: ฿{last.portfolioValueThb.toFixed(0)}
          </div>
          <div>Total invested: ฿{last.totalInvestedThb.toFixed(0)}</div>
          <div>
            Net monthly dividend at year {last.year}: ฿{last.netMonthlyDividendThb.toFixed(0)}
          </div>
        </div>
      )}
    </div>
  );
}

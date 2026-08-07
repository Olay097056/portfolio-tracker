import { useEffect, useState } from 'react';
import { getMarketData } from '../api/client';
import type { MarketData } from '../api/types';
import { calculateRequiredPortfolio } from '../utils/passiveIncome';

export interface PassiveIncomeCalculatorProps {
  currency?: 'THB' | 'USD';
  fxRate?: number;
}

// Below this many years of real price history, the annualized growth rate is real but
// warned-about as unreliable for long-term planning (same threshold/reasoning as
// DcaProjectionCalculator — see its comment for the motivating real case, QQQI).
const SHORT_HISTORY_THRESHOLD_YEARS = 3;

export function PassiveIncomeCalculator({ currency = 'USD', fxRate: _fxRate = 33.38 }: PassiveIncomeCalculatorProps) {
  const [ticker, setTicker] = useState('');
  const [targetMonthlyIncome, setTargetMonthlyIncome] = useState(currency === 'THB' ? '30000' : '1000');
  const [initialInvestment, setInitialInvestment] = useState(currency === 'THB' ? '100000' : '3000');
  const [monthlyContribution, setMonthlyContribution] = useState(currency === 'THB' ? '15000' : '500');
  const [dividendYieldPct, setDividendYieldPct] = useState('');
  const [priceGrowthRatePct, setPriceGrowthRatePct] = useState('');
  const [taxRatePct, setTaxRatePct] = useState('15');
  const [growthYearsUsed, setGrowthYearsUsed] = useState<number | null>(null);

  const symbol = currency === 'THB' ? '฿' : '$';

  useEffect(() => {
    const trimmed = ticker.trim().toUpperCase();
    if (!trimmed) {
      return;
    }
    let cancelled = false;
    const timeoutId = setTimeout(() => {
      getMarketData([trimmed])
        .then((data: Record<string, MarketData>) => {
          if (cancelled) return;
          const entry = data[trimmed];
          if (entry?.dividend_yield_pct != null) {
            setDividendYieldPct(String(entry.dividend_yield_pct.toFixed(2)));
          }
          if (entry?.growth_rate_pct != null) {
            setPriceGrowthRatePct(String(entry.growth_rate_pct.toFixed(2)));
            setGrowthYearsUsed(entry.growth_rate_years_used ?? null);
          } else {
            setGrowthYearsUsed(null);
          }
        })
        .catch(() => {
          // leave fields blank/editable on failure — never fabricate a value
          setGrowthYearsUsed(null);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [ticker]);

  const numTarget = Number(targetMonthlyIncome) || 0;
  const numInitial = Number(initialInvestment) || 0;
  const numMonthly = Number(monthlyContribution) || 0;

  const result = calculateRequiredPortfolio({
    targetMonthlyIncomeThb: numTarget,
    initialInvestmentThb: numInitial,
    monthlyContributionThb: numMonthly,
    dividendYieldPct: Number(dividendYieldPct) || 0,
    priceGrowthRatePct: Number(priceGrowthRatePct) || 0,
    taxRatePct: Number(taxRatePct) || 0,
  });

  return (
    <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>💰 Passive Income Freedom Calculator</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Determine required portfolio size and estimated timeline to reach your target monthly dividend income.
          </p>
        </div>
        <span className="badge badge-yellow" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
          Active Currency: {currency} ({symbol})
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        <div>
          <label htmlFor="ff-ticker" style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 600 }}>
            Ticker (Optional Auto-fill)
          </label>
          <input
            id="ff-ticker"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder="e.g. SCHD, JEPI, VYM"
            className="glass-input"
            style={{ width: '100%', padding: '8px 12px' }}
          />
        </div>

        <div>
          <label htmlFor="ff-target" style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 600 }}>
            Target monthly income ({currency})
          </label>
          <input
            id="ff-target"
            type="number"
            value={targetMonthlyIncome}
            onChange={(e) => setTargetMonthlyIncome(e.target.value)}
            className="glass-input"
            style={{ width: '100%', padding: '8px 12px' }}
          />
        </div>

        <div>
          <label htmlFor="ff-initial" style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 600 }}>
            Initial investment ({currency})
          </label>
          <input
            id="ff-initial"
            type="number"
            value={initialInvestment}
            onChange={(e) => setInitialInvestment(e.target.value)}
            className="glass-input"
            style={{ width: '100%', padding: '8px 12px' }}
          />
        </div>

        <div>
          <label htmlFor="ff-monthly" style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 600 }}>
            Monthly contribution ({currency})
          </label>
          <input
            id="ff-monthly"
            type="number"
            value={monthlyContribution}
            onChange={(e) => setMonthlyContribution(e.target.value)}
            className="glass-input"
            style={{ width: '100%', padding: '8px 12px' }}
          />
        </div>

        <div>
          <label htmlFor="ff-yield" style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 600 }}>
            Dividend yield (%/yr)
          </label>
          <input
            id="ff-yield"
            type="number"
            step="0.1"
            value={dividendYieldPct}
            onChange={(e) => setDividendYieldPct(e.target.value)}
            placeholder="e.g. 4.5"
            className="glass-input"
            style={{ width: '100%', padding: '8px 12px' }}
          />
        </div>

        <div>
          <label htmlFor="ff-growth" style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 600 }}>
            Price growth (%/yr)
          </label>
          <input
            id="ff-growth"
            type="number"
            step="0.1"
            value={priceGrowthRatePct}
            onChange={(e) => {
              setPriceGrowthRatePct(e.target.value);
              setGrowthYearsUsed(null); // a hand-typed number has no "years of history" behind it
            }}
            placeholder="e.g. 5.0"
            className="glass-input"
            style={{ width: '100%', padding: '8px 12px' }}
          />
          {growthYearsUsed != null && growthYearsUsed < SHORT_HISTORY_THRESHOLD_YEARS && (
            <p role="alert" style={{ margin: '6px 0 0 0', fontSize: '0.74rem', color: 'var(--yellow)', lineHeight: 1.4 }}>
              ⚠️ คำนวณจากข้อมูลราคาย้อนหลังแค่ {growthYearsUsed.toFixed(1)} ปี (หุ้น/กองทุนนี้เพิ่งเข้าตลาดไม่นาน) —
              ตัวเลขนี้เป็นข้อมูลจริง แต่ช่วงเวลาสั้นอาจไม่สะท้อนอัตราเติบโตระยะยาวที่แท้จริง
            </p>
          )}
        </div>

        <div>
          <label htmlFor="ff-tax" style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 600 }}>
            Dividend tax rate (%) — Standard 15% Withholding Tax
          </label>
          <input
            id="ff-tax"
            type="number"
            value={taxRatePct}
            onChange={(e) => setTaxRatePct(e.target.value)}
            className="glass-input"
            style={{ width: '100%', padding: '8px 12px' }}
          />
        </div>
      </div>

      {/* Summary Output Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        <div className="glass-stat-card" style={{ borderColor: 'rgba(252, 211, 77, 0.3)' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Target Required Portfolio Size</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fcd34d', marginTop: '4px' }}>
            Required portfolio: {symbol}{result.requiredPortfolioThb.toFixed(0)}
          </div>
        </div>

        <div className="glass-stat-card" style={{ borderColor: result.isAchievableWithin30Years ? 'rgba(52, 211, 153, 0.3)' : 'rgba(244, 63, 94, 0.3)' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Timeline to Freedom Goal</div>
          <div
            style={{
              fontSize: '1.1rem',
              fontWeight: 700,
              marginTop: '6px',
              color: result.isAchievableWithin30Years ? 'var(--green)' : 'var(--red)',
            }}
          >
            {result.isAchievableWithin30Years
              ? `Reachable in ${result.yearsToTarget} years at this contribution rate`
              : 'Not reachable within 30 years at this contribution rate'}
          </div>
        </div>
      </div>

      {/* Yearly Freedom Progress Breakdown Table (1–30 Years) */}
      {result.yearlyProjection.length > 0 && (
        <div style={{ marginTop: '10px' }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>
            📈 1–30 Year Passive Income Freedom Projection
          </h4>
          <div style={{ overflowX: 'auto' }}>
            <table className="zebra-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  <th style={{ padding: '10px 12px' }}>Year</th>
                  <th style={{ padding: '10px 12px' }}>Annual Contribution</th>
                  <th style={{ padding: '10px 12px' }}>Dividend/Interest Earned</th>
                  <th style={{ padding: '10px 12px' }}>Withheld Tax ({taxRatePct}%)</th>
                  <th style={{ padding: '10px 12px' }}>Ending Portfolio Balance</th>
                  <th style={{ padding: '10px 12px' }}>Target Income Progress</th>
                </tr>
              </thead>
              <tbody>
                {result.yearlyProjection.map((row) => (
                  <tr key={row.year} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.88rem' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#f8fafc' }}>Year {row.year}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {symbol}{row.annualContributionThb.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#fcd34d' }}>
                      {symbol}{row.grossAnnualDividendThb.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#fb7185' }}>
                      {symbol}{row.annualTaxWithheldThb.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--primary)' }}>
                      {symbol}{row.portfolioValueThb.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div
                          style={{
                            flex: 1,
                            height: '6px',
                            borderRadius: '3px',
                            background: 'rgba(255,255,255,0.1)',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${row.progressPct}%`,
                              height: '100%',
                              background: row.progressPct >= 100 ? 'linear-gradient(90deg, #10b981 0%, #34d399 100%)' : 'linear-gradient(90deg, #0284c7 0%, #38bdf8 100%)',
                              boxShadow: row.progressPct >= 100 ? '0 0 8px rgba(52,211,153,0.5)' : '0 0 8px rgba(56,189,248,0.5)',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, minWidth: '42px', textAlign: 'right' }}>
                          {row.progressPct.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

}

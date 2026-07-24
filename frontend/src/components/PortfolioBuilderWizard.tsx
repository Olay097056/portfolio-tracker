import { useState } from 'react';
import { createHolding, createPortfolio, getPrices, getUsdToThbRate } from '../api/client';
import { buildPortfolioPlan, type PortfolioBuilderLine } from '../utils/portfolioBuilder';
import { PORTFOLIO_BUILDER_PRESETS } from '../utils/portfolioBuilderPresets';

export function PortfolioBuilderWizard() {
  const [presetId, setPresetId] = useState(PORTFOLIO_BUILDER_PRESETS[0].id);
  const [name, setName] = useState('');
  const [capitalThb, setCapitalThb] = useState('');
  const [lines, setLines] = useState<PortfolioBuilderLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);

  const preset = PORTFOLIO_BUILDER_PRESETS.find((p) => p.id === presetId) ?? PORTFOLIO_BUILDER_PRESETS[0];

  async function handlePreview() {
    setError(null);
    setLines(null);
    setCreated(false);

    const capital = Number(capitalThb) || 0;
    if (capital <= 0) {
      setError('Enter a capital amount greater than zero.');
      return;
    }

    const tickers = Array.from(new Set(preset.buckets.flatMap((b) => b.tickers)));

    try {
      const [usdThbRate, prices] = await Promise.all([getUsdToThbRate(), getPrices(tickers)]);
      if (usdThbRate == null) {
        setError('Could not fetch the current USD/THB rate — try again later.');
        return;
      }
      const plan = buildPortfolioPlan({ preset, capitalThb: capital, usdThbRate, pricesUsd: prices });
      if (plan.length === 0) {
        setError('Could not fetch prices for any ticker in this preset — try again later.');
        return;
      }
      setLines(plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleCreate() {
    if (!lines || !name.trim()) {
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const portfolio = await createPortfolio({ name });
      for (const line of lines) {
        await createHolding(portfolio.id, { ticker: line.ticker, shares: line.shares, avg_cost_usd: line.priceUsd });
      }
      setCreated(true);
      setLines(null);
      setName('');
      setCapitalThb('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      // clear the preview on failure so a retry can't blindly re-call createPortfolio and create a duplicate — force a fresh Preview first
      setLines(null);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <h3>Portfolio Builder</h3>
      {error && <div role="alert">{error}</div>}
      {created && <div>Portfolio created.</div>}

      <fieldset>
        <legend>Goal</legend>
        {PORTFOLIO_BUILDER_PRESETS.map((p) => (
          <label key={p.id}>
            <input
              type="radio"
              name="portfolio-builder-preset"
              value={p.id}
              checked={presetId === p.id}
              onChange={() => {
                setPresetId(p.id);
                setLines(null);
              }}
            />
            {p.name}
          </label>
        ))}
      </fieldset>
      <p>{preset.description}</p>

      <label htmlFor="pb-name">Portfolio name</label>
      <input id="pb-name" value={name} onChange={(e) => setName(e.target.value)} />

      <label htmlFor="pb-capital">Capital (THB)</label>
      <input
        id="pb-capital"
        type="number"
        value={capitalThb}
        onChange={(e) => {
          setCapitalThb(e.target.value);
          setLines(null);
        }}
      />

      <button type="button" onClick={handlePreview}>
        Preview allocation
      </button>

      {lines && (
        <div>
          <table>
            <tbody>
              {lines.map((line) => (
                <tr key={line.ticker}>
                  <td>{line.ticker}</td>
                  <td>{line.bucketLabel}</td>
                  <td>{line.shares.toFixed(4)} shares</td>
                  <td>฿{line.capitalThb.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={handleCreate} disabled={creating || !name.trim()}>
            Create portfolio
          </button>
        </div>
      )}
    </div>
  );
}

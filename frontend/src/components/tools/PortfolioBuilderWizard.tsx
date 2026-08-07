import { useState } from 'react';
import { createHolding, createPortfolio, deletePortfolio, getPrices, getUsdToThbRate } from '../../api/client';
import type { Portfolio } from '../../api/types';
import { buildPortfolioPlan, type PortfolioBuilderLine } from '../../utils/portfolioBuilder';
import { PORTFOLIO_BUILDER_PRESETS } from '../../utils/portfolioBuilderPresets';

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
    let portfolio: Portfolio | null = null;
    try {
      portfolio = await createPortfolio({ name });
      for (const line of lines) {
        await createHolding(portfolio.id, { ticker: line.ticker, shares: line.shares, avg_cost_usd: line.priceUsd });
      }
      setCreated(true);
      setLines(null);
      setName('');
      setCapitalThb('');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (portfolio) {
        try {
          await deletePortfolio(portfolio.id);
          setError(`${message} — the partially created portfolio was removed. You can try again.`);
        } catch {
          setError(
            `${message} — and could not remove the partially created portfolio "${portfolio.name}" either. Check Portfolios and delete it manually.`,
          );
        }
      } else {
        setError(message);
      }
      setLines(null);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>🏗️ Automated Portfolio Builder Wizard</h3>
        <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Select a standard pre-built investment strategy and instantly generate precise stock share allocations based on your capital.
        </p>
      </div>

      {error && <div role="alert" className="badge badge-red" style={{ padding: '10px 14px', fontSize: '0.88rem' }}>{error}</div>}
      {created && <div className="badge badge-green" style={{ padding: '10px 14px', fontSize: '0.88rem' }}>Portfolio created successfully! Check Portfolios tab.</div>}

      <fieldset style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '16px', background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(8px)' }}>
        <legend style={{ padding: '0 8px', fontWeight: 700, fontSize: '0.9rem', color: '#f8fafc' }}>Goal Strategy</legend>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          {PORTFOLIO_BUILDER_PRESETS.map((p) => (
            <label
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 14px',
                borderRadius: '10px',
                background: presetId === p.id ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${presetId === p.id ? 'rgba(129,140,248,0.5)' : 'rgba(255,255,255,0.08)'}`,
                cursor: 'pointer',
                fontWeight: presetId === p.id ? 700 : 500,
                transition: 'all 0.2s ease',
              }}
            >
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
        </div>
      </fieldset>

      <div style={{ padding: '14px 18px', borderRadius: '10px', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', backdropFilter: 'blur(8px)' }}>
        <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#818cf8', marginBottom: '4px' }}>{preset.name} Strategy</div>
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: '1.45' }}>{preset.description}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        <div>
          <label htmlFor="pb-name" style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 600 }}>
            Portfolio name
          </label>
          <input
            id="pb-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My Freedom Growth Fund"
            className="glass-input"
            style={{ width: '100%', padding: '8px 12px' }}
          />
        </div>

        <div>
          <label htmlFor="pb-capital" style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', fontWeight: 600 }}>
            Capital (THB)
          </label>
          <input
            id="pb-capital"
            type="number"
            value={capitalThb}
            onChange={(e) => {
              setCapitalThb(e.target.value);
              setLines(null);
            }}
            placeholder="e.g. 100000"
            className="glass-input"
            style={{ width: '100%', padding: '8px 12px' }}
          />
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={handlePreview}
          className="glass-btn-primary"
          style={{
            padding: '10px 24px',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          Preview allocation
        </button>
      </div>

      {lines && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '10px' }}>
          <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>📋 Recommended Portfolio Allocation Breakdown</h4>
          <div style={{ overflowX: 'auto' }}>
            <table className="zebra-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  <th style={{ padding: '10px 12px' }}>Ticker</th>
                  <th style={{ padding: '10px 12px' }}>Category</th>
                  <th style={{ padding: '10px 12px' }}>Allocation %</th>
                  <th style={{ padding: '10px 12px' }}>Calculated Shares</th>
                  <th style={{ padding: '10px 12px' }}>Price (USD)</th>
                  <th style={{ padding: '10px 12px' }}>Capital (THB)</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.ticker} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.88rem' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#f8fafc' }}>{line.ticker}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{line.bucketLabel}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#38bdf8' }}>{line.targetAllocationPct.toFixed(0)}%</td>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#fcd34d' }}>{line.shares.toFixed(4)} shares</td>
                    <td style={{ padding: '10px 12px' }}>${line.priceUsd.toFixed(2)}</td>
                    <td style={{ padding: '10px 12px' }}>฿{line.capitalThb.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || !name.trim()}
              style={{
                padding: '10px 24px',
                borderRadius: '8px',
                color: 'var(--primary)',
                borderColor: 'var(--primary)',
                opacity: creating || !name.trim() ? 0.5 : 1,
                cursor: creating || !name.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {creating ? 'Creating Portfolio...' : 'Create portfolio'}
            </button>

          </div>
        </div>
      )}
    </div>
  );

}

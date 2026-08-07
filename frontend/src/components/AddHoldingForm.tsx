// frontend/src/components/AddHoldingForm.tsx
import { useState, type FormEvent } from 'react';
import type { HoldingCreateInput } from '../api/types';

interface AddHoldingFormProps {
  onSubmit: (input: HoldingCreateInput) => void | Promise<void>;
}

export function AddHoldingForm({ onSubmit }: AddHoldingFormProps) {
  const [ticker, setTicker] = useState('');
  const [shares, setShares] = useState('');
  const [avgCost, setAvgCost] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!ticker.trim() || shares === '' || avgCost === '') {
      return;
    }
    try {
      await onSubmit({ ticker, shares: Number(shares), avg_cost_usd: Number(avgCost) });
      setTicker('');
      setShares('');
      setAvgCost('');
    } catch {
      // Leave the fields populated so the user can retry; the error itself
      // is surfaced by the page-level error banner.
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '120px', flexGrow: 1 }}>
        <label htmlFor="holding-ticker" style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Ticker</label>
        <input
          id="holding-ticker"
          placeholder="e.g. AAPL"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          style={{ padding: '7px 10px', fontSize: '0.85rem', textTransform: 'uppercase' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '110px' }}>
        <label htmlFor="holding-shares" style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Shares</label>
        <input
          id="holding-shares"
          type="number"
          placeholder="10"
          value={shares}
          onChange={(e) => setShares(e.target.value)}
          style={{ padding: '7px 10px', fontSize: '0.85rem' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '130px' }}>
        <label htmlFor="holding-avg-cost" style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Average cost ($)</label>
        <input
          id="holding-avg-cost"
          type="number"
          placeholder="150.00"
          value={avgCost}
          onChange={(e) => setAvgCost(e.target.value)}
          style={{ padding: '7px 10px', fontSize: '0.85rem' }}
        />
      </div>

      <button
        type="submit"
        style={{
          padding: '7px 16px',
          fontSize: '0.85rem',
          fontWeight: 700,
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        + Add holding
      </button>
    </form>
  );
}

import { useState, type FormEvent } from 'react';
import type { HoldingCreateInput } from '../api/types';

interface AddHoldingFormProps {
  onSubmit: (input: HoldingCreateInput) => void;
}

export function AddHoldingForm({ onSubmit }: AddHoldingFormProps) {
  const [ticker, setTicker] = useState('');
  const [shares, setShares] = useState('');
  const [avgCost, setAvgCost] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!ticker.trim() || shares === '' || avgCost === '') {
      return;
    }
    onSubmit({ ticker, shares: Number(shares), avg_cost_usd: Number(avgCost) });
    setTicker('');
    setShares('');
    setAvgCost('');
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="holding-ticker">Ticker</label>
      <input id="holding-ticker" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} />

      <label htmlFor="holding-shares">Shares</label>
      <input id="holding-shares" type="number" value={shares} onChange={(e) => setShares(e.target.value)} />

      <label htmlFor="holding-avg-cost">Average cost ($)</label>
      <input id="holding-avg-cost" type="number" value={avgCost} onChange={(e) => setAvgCost(e.target.value)} />

      <button type="submit">+ Add holding</button>
    </form>
  );
}

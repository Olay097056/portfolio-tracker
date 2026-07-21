import { useState, type FormEvent } from 'react';
import type { PortfolioCreateInput } from '../api/types';

interface AddPortfolioFormProps {
  onSubmit: (input: PortfolioCreateInput) => void | Promise<void>;
}

export function AddPortfolioForm({ onSubmit }: AddPortfolioFormProps) {
  const [name, setName] = useState('');
  const [cash, setCash] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    try {
      await onSubmit({ name, cash_usd: cash === '' ? 0 : Number(cash) });
      setName('');
      setCash('');
    } catch {
      // Leave the fields populated so the user can retry; the error itself
      // is surfaced by the page-level error banner (see PortfoliosPage).
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="portfolio-name">Name</label>
      <input id="portfolio-name" value={name} onChange={(e) => setName(e.target.value)} />

      <label htmlFor="portfolio-cash">Cash (USD)</label>
      <input id="portfolio-cash" type="number" value={cash} onChange={(e) => setCash(e.target.value)} />

      <button type="submit">+ Add portfolio</button>
    </form>
  );
}

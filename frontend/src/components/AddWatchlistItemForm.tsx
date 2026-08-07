import { useState, type FormEvent } from 'react';
import type { WatchlistItemCreateInput } from '../api/types';
import { TickerAutocomplete } from './TickerAutocomplete';

interface AddWatchlistItemFormProps {
  onSubmit: (input: WatchlistItemCreateInput) => void | Promise<void>;
}

export function AddWatchlistItemForm({ onSubmit }: AddWatchlistItemFormProps) {
  const [ticker, setTicker] = useState('');
  const [category, setCategory] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedTicker = ticker.trim();
    if (!trimmedTicker) {
      return;
    }
    const trimmedCategory = category.trim();
    try {
      // Normalised to upper case here so "vti" and "VTI" can never become two watchlist entries.
      await onSubmit({ ticker: trimmedTicker.toUpperCase(), category: trimmedCategory === '' ? null : trimmedCategory });
      setTicker('');
      setCategory('');
    } catch {
      // Leave the fields populated so the user can retry; the error itself
      // is surfaced by the page-level error banner (see WatchlistManagementPage).
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="watchlist-ticker">Ticker</label>
      <TickerAutocomplete
        id="watchlist-ticker"
        value={ticker}
        onChange={setTicker}
        onSelect={(item) => setTicker(item.symbol)}
      />

      <label htmlFor="watchlist-category">Category (optional)</label>
      <input id="watchlist-category" value={category} onChange={(e) => setCategory(e.target.value)} />

      <button type="submit">+ Add to watchlist</button>
    </form>
  );
}

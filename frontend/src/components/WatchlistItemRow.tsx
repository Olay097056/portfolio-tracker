import type { WatchlistItem } from '../api/types';

interface WatchlistItemRowProps {
  item: WatchlistItem;
  onDelete: (id: number) => void;
}

export function WatchlistItemRow({ item, onDelete }: WatchlistItemRowProps) {
  return (
    <div style={{ background: 'var(--panel3)', borderRadius: 8, padding: 8, marginBottom: 8 }}>
      <span>{item.ticker}</span>
      <span>{item.category ?? 'No category'}</span>
      <button onClick={() => onDelete(item.id)} style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
        Remove
      </button>
    </div>
  );
}

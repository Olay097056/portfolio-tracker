import type { WatchlistItem } from '../api/types';

interface WatchlistItemRowProps {
  item: WatchlistItem;
  onDelete: (id: number) => void;
}

export function WatchlistItemRow({ item, onDelete }: WatchlistItemRowProps) {
  return (
    <div>
      <span>{item.ticker}</span>
      <span>{item.category ?? 'No category'}</span>
      <button onClick={() => onDelete(item.id)}>Remove</button>
    </div>
  );
}

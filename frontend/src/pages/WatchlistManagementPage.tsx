import { AddWatchlistItemForm } from '../components/AddWatchlistItemForm';
import { WatchlistItemRow } from '../components/WatchlistItemRow';
import { useWatchlist } from '../hooks/useWatchlist';

export function WatchlistManagementPage() {
  const { items, loading, error, create, remove } = useWatchlist();

  if (loading) {
    return <div>Loading watchlist…</div>;
  }

  return (
    <div>
      {error && <div role="alert">{error}</div>}
      <AddWatchlistItemForm onSubmit={create} />
      {items.length === 0 ? (
        <p>Your watchlist is empty — add your first ticker above.</p>
      ) : (
        items.map((item) => <WatchlistItemRow key={item.id} item={item} onDelete={remove} />)
      )}
    </div>
  );
}

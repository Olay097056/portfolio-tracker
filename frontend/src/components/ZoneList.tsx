// frontend/src/components/ZoneList.tsx
import type { Zone } from '../api/types';
import { formatNumber } from '../utils/signalFormatting';

interface ZoneListProps {
  zones: Zone[];
  onEditPrice: (zoneId: number, price: number) => void;
  onDelete: (zoneId: number) => void;
}

export function ZoneList({ zones, onEditPrice, onDelete }: ZoneListProps) {
  if (zones.length === 0) {
    return <p>No support/resistance zones yet.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Price</th>
          <th>Kind</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {zones.map((zone) => (
          <tr key={zone.id ?? `auto-${zone.kind}-${zone.price}`}>
            <td>
              {zone.source === 'manual' && zone.id !== null ? (
                <input
                  type="number"
                  aria-label={`${zone.kind} zone price`}
                  defaultValue={zone.price}
                  onBlur={(e) => {
                    const value = Number(e.target.value);
                    if (!Number.isNaN(value) && value !== zone.price) {
                      onEditPrice(zone.id as number, value);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                />
              ) : (
                formatNumber(zone.price)
              )}
            </td>
            <td>{zone.kind}</td>
            <td>
              {zone.source === 'manual' && zone.id !== null && (
                <button type="button" onClick={() => onDelete(zone.id as number)}>
                  Delete
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

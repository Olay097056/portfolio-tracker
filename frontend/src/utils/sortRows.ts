// frontend/src/utils/sortRows.ts
export type SortDirection = 'asc' | 'desc';

export function sortByNullableNumber<T>(rows: T[], getValue: (row: T) => number | null, direction: SortDirection): T[] {
  return [...rows].sort((a, b) => {
    const aValue = getValue(a);
    const bValue = getValue(b);
    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return 1;
    if (bValue == null) return -1;
    return direction === 'asc' ? aValue - bValue : bValue - aValue;
  });
}

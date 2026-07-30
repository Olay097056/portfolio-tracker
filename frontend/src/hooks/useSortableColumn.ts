// frontend/src/hooks/useSortableColumn.ts
import { useState } from 'react';
import type { SortDirection } from '../utils/sortRows';

export function useSortableColumn<C extends string>(initialColumn: C) {
  const [sortColumn, setSortColumn] = useState<C>(initialColumn);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  function toggleSort(column: C) {
    if (column === sortColumn) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  }

  function ariaSortFor(column: C): 'ascending' | 'descending' | undefined {
    if (sortColumn !== column) return undefined;
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  }

  return { sortColumn, sortDirection, toggleSort, ariaSortFor };
}

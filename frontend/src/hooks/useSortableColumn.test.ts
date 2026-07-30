// frontend/src/hooks/useSortableColumn.test.ts
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSortableColumn } from './useSortableColumn';

type Column = 'a' | 'b';

describe('useSortableColumn', () => {
  it('starts on the given column, descending by default', () => {
    const { result } = renderHook(() => useSortableColumn<Column>('a'));

    expect(result.current.sortColumn).toBe('a');
    expect(result.current.sortDirection).toBe('desc');
    expect(result.current.ariaSortFor('a')).toBe('descending');
    expect(result.current.ariaSortFor('b')).toBeUndefined();
  });

  it('starts ascending when an initial direction is given', () => {
    const { result } = renderHook(() => useSortableColumn<Column>('a', 'asc'));

    expect(result.current.sortDirection).toBe('asc');
    expect(result.current.ariaSortFor('a')).toBe('ascending');
  });

  it('toggles direction when the same column is clicked again', () => {
    const { result } = renderHook(() => useSortableColumn<Column>('a'));

    act(() => result.current.toggleSort('a'));
    expect(result.current.sortDirection).toBe('asc');

    act(() => result.current.toggleSort('a'));
    expect(result.current.sortDirection).toBe('desc');
  });

  it('switches to a new column defaulting to descending', () => {
    const { result } = renderHook(() => useSortableColumn<Column>('a'));

    act(() => result.current.toggleSort('a')); // now asc
    act(() => result.current.toggleSort('b')); // switch column

    expect(result.current.sortColumn).toBe('b');
    expect(result.current.sortDirection).toBe('desc');
    expect(result.current.ariaSortFor('a')).toBeUndefined();
    expect(result.current.ariaSortFor('b')).toBe('descending');
  });
});

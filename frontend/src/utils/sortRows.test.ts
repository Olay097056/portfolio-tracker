// frontend/src/utils/sortRows.test.ts
import { describe, expect, it } from 'vitest';
import { sortByNullableNumber } from './sortRows';

describe('sortByNullableNumber', () => {
  const rows = [
    { ticker: 'A', value: 3 },
    { ticker: 'B', value: null },
    { ticker: 'C', value: 1 },
    { ticker: 'D', value: 2 },
  ];

  it('sorts ascending with nulls last', () => {
    const sorted = sortByNullableNumber(rows, (r) => r.value, 'asc');
    expect(sorted.map((r) => r.ticker)).toEqual(['C', 'D', 'A', 'B']);
  });

  it('sorts descending with nulls last', () => {
    const sorted = sortByNullableNumber(rows, (r) => r.value, 'desc');
    expect(sorted.map((r) => r.ticker)).toEqual(['A', 'D', 'C', 'B']);
  });

  it('does not mutate the input array', () => {
    const original = [...rows];
    sortByNullableNumber(rows, (r) => r.value, 'asc');
    expect(rows).toEqual(original);
  });

  it('treats two null values as tied rather than reordering them', () => {
    const allNull = [
      { ticker: 'X', value: null },
      { ticker: 'Y', value: null },
    ];
    const sorted = sortByNullableNumber(allNull, (r) => r.value, 'asc');
    expect(sorted.map((r) => r.ticker)).toEqual(['X', 'Y']);
  });
});

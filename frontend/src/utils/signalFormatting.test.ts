// frontend/src/utils/signalFormatting.test.ts
import { describe, expect, it } from 'vitest';
import { formatNumber, formatSignedPercent } from './signalFormatting';

describe('formatSignedPercent', () => {
  it('formats a positive value with a percent sign', () => {
    expect(formatSignedPercent(1.5)).toBe('1.50%');
  });

  it('formats a negative value with a percent sign', () => {
    expect(formatSignedPercent(-2.25)).toBe('-2.25%');
  });

  it('shows Unavailable for null', () => {
    expect(formatSignedPercent(null)).toBe('Unavailable');
  });

  it('shows Unavailable for undefined', () => {
    expect(formatSignedPercent(undefined)).toBe('Unavailable');
  });
});

describe('formatNumber', () => {
  it('formats a value to two decimal places', () => {
    expect(formatNumber(65.4)).toBe('65.40');
  });

  it('shows Unavailable for null', () => {
    expect(formatNumber(null)).toBe('Unavailable');
  });

  it('shows Unavailable for undefined', () => {
    expect(formatNumber(undefined)).toBe('Unavailable');
  });
});

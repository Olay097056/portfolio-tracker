import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { DcaProjectionCalculator } from './DcaProjectionCalculator';

describe('DcaProjectionCalculator', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a projection using the default inputs without requiring a ticker', () => {
    render(<DcaProjectionCalculator />);

    expect(screen.getByText(/Portfolio value after 10 years/i)).toBeInTheDocument();
  });

  it('pre-fills yield and growth from real market data once a ticker is entered', async () => {
    vi.spyOn(client, 'getMarketData').mockResolvedValue({
      JEPQ: { price: 58.5, dividend_yield_pct: 11.1, growth_rate_pct: 10 },
    });

    render(<DcaProjectionCalculator />);
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'JEPQ' } });

    await waitFor(() => expect(screen.getByLabelText(/dividend yield/i)).toHaveValue(11.1));
    expect(screen.getByLabelText(/price growth/i)).toHaveValue(10);
  });

  it('leaves yield and growth blank and editable when market data cannot be fetched', async () => {
    vi.spyOn(client, 'getMarketData').mockRejectedValue(new Error('yfinance unavailable'));

    render(<DcaProjectionCalculator />);
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'BADTICKER' } });

    await waitFor(() => expect(client.getMarketData).toHaveBeenCalled());
    expect(screen.getByLabelText(/dividend yield/i)).toHaveValue(null);

    fireEvent.change(screen.getByLabelText(/dividend yield/i), { target: { value: '7' } });
    expect(screen.getByLabelText(/dividend yield/i)).toHaveValue(7);
  });
});

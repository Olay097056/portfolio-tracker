import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { PassiveIncomeCalculator } from './PassiveIncomeCalculator';

describe('PassiveIncomeCalculator', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a required-portfolio result using the default inputs without requiring a ticker', () => {
    render(<PassiveIncomeCalculator />);

    expect(screen.getByText(/Required portfolio/i)).toBeInTheDocument();
  });

  it('wraps its content in a card', () => {
    const { container } = render(<PassiveIncomeCalculator />);

    expect(container.querySelector('.card')).not.toBeNull();
  });

  it('colors the outcome message green when the target is reachable within 30 years', () => {
    render(<PassiveIncomeCalculator />);
    // Defaults leave yield/growth blank (0%), which is not reachable — fill in a realistic yield
    // and growth rate so the target actually becomes reachable within 30 years.
    fireEvent.change(screen.getByLabelText(/dividend yield/i), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText(/price growth/i), { target: { value: '5' } });

    const outcome = screen.getByText(/^reachable/i);
    expect(outcome).toHaveStyle({ color: 'var(--green)' });
  });

  it('colors the outcome message red when the target is not reachable within 30 years', () => {
    render(<PassiveIncomeCalculator />);

    fireEvent.change(screen.getByLabelText(/target monthly income/i), { target: { value: '10000000' } });

    const outcome = screen.getByText(/not reachable/i);
    expect(outcome).toHaveStyle({ color: 'var(--red)' });
  });

  it('pre-fills yield and growth from real market data once a ticker is entered', async () => {
    vi.spyOn(client, 'getMarketData').mockResolvedValue({
      JEPQ: { price: 58.5, dividend_yield_pct: 11.1, growth_rate_pct: 10 },
    });

    render(<PassiveIncomeCalculator />);
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'JEPQ' } });

    await waitFor(() => expect(screen.getByLabelText(/dividend yield/i)).toHaveValue(11.1));
    expect(screen.getByLabelText(/price growth/i)).toHaveValue(10);
  });

  it('leaves yield and growth blank and editable when market data cannot be fetched', async () => {
    vi.spyOn(client, 'getMarketData').mockRejectedValue(new Error('yfinance unavailable'));

    render(<PassiveIncomeCalculator />);
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'BADTICKER' } });

    await waitFor(() => expect(client.getMarketData).toHaveBeenCalled());
    expect(screen.getByLabelText(/dividend yield/i)).toHaveValue(null);

    fireEvent.change(screen.getByLabelText(/dividend yield/i), { target: { value: '7' } });
    expect(screen.getByLabelText(/dividend yield/i)).toHaveValue(7);
  });
});

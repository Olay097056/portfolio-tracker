import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../../api/client';
import { PassiveIncomeCalculator } from './PassiveIncomeCalculator';

describe('PassiveIncomeCalculator', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a required-portfolio result using the default inputs without requiring a ticker', () => {
    render(<PassiveIncomeCalculator />);

    expect(screen.getAllByText(/Required portfolio/i).length).toBeGreaterThan(0);
  });

  it('wraps its content in a card', () => {
    const { container } = render(<PassiveIncomeCalculator />);

    expect(container.querySelector('.card')).not.toBeNull();
  });

  it('colors the outcome message green when the target is reachable within 30 years', () => {
    render(<PassiveIncomeCalculator />);
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
      JEPQ: { price: 58.5, dividend_yield_pct: 11.1, growth_rate_pct: 10, growth_rate_years_used: 5 },
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

  it('shows a short-history warning when the growth rate was computed over a recently-listed ticker\'s short history', async () => {
    vi.spyOn(client, 'getMarketData').mockResolvedValue({
      QQQI: { price: 55.16, dividend_yield_pct: 13.83, growth_rate_pct: 20.02, growth_rate_years_used: 2.51 },
    });

    render(<PassiveIncomeCalculator />);
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'QQQI' } });

    await waitFor(() => expect(screen.getByLabelText(/price growth/i)).toHaveValue(20.02));
    expect(screen.getByRole('alert')).toHaveTextContent('2.5');
  });

  it('clears the short-history warning the moment the user edits the growth field by hand', async () => {
    vi.spyOn(client, 'getMarketData').mockResolvedValue({
      QQQI: { price: 55.16, dividend_yield_pct: 13.83, growth_rate_pct: 20.02, growth_rate_years_used: 2.51 },
    });

    render(<PassiveIncomeCalculator />);
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'QQQI' } });
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/price growth/i), { target: { value: '8' } });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('displays THB symbol and hints when currency="THB" prop is passed', () => {
    render(<PassiveIncomeCalculator currency="THB" fxRate={33.38} />);

    expect(screen.getByText(/Active Currency: THB \(฿\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Target monthly income \(THB\)/i)).toBeInTheDocument();
  });

  it('renders a 1-30 year passive income breakdown table with progress bar', () => {
    render(<PassiveIncomeCalculator />);

    expect(screen.getByText(/1–30 Year Passive Income Freedom Projection/i)).toBeInTheDocument();
    expect(screen.getByText('Year 1')).toBeInTheDocument();
    expect(screen.getByText('Year 30')).toBeInTheDocument();
  });
});

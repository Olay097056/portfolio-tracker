import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StressTestCalculator } from './StressTestCalculator';

describe('StressTestCalculator', () => {
  it('shows the three fixed scenarios after entering an investment amount', () => {
    render(<StressTestCalculator currentPriceUsd={100} />);

    fireEvent.change(screen.getByLabelText(/investment amount/i), { target: { value: '1000' } });

    expect(screen.getByText('-5%')).toBeInTheDocument();
    expect(screen.getByText('-10%')).toBeInTheDocument();
    expect(screen.getByText('-20%')).toBeInTheDocument();
    expect(screen.getByText(/950.00/)).toBeInTheDocument();
    expect(screen.getByText(/900.00/)).toBeInTheDocument();
    expect(screen.getByText(/800.00/)).toBeInTheDocument();
  });

  it('adds a custom scenario when a target price is entered', () => {
    render(<StressTestCalculator currentPriceUsd={100} />);

    fireEvent.change(screen.getByLabelText(/investment amount/i), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText(/target price/i), { target: { value: '70' } });

    expect(screen.getByText('Custom')).toBeInTheDocument();
    expect(screen.getByText(/700.00/)).toBeInTheDocument();
  });
});

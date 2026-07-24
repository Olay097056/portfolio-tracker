import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DcaCalculator } from './DcaCalculator';

describe('DcaCalculator', () => {
  it('shows updated new average cost, shares, and total cost after entering an investment amount', () => {
    render(<DcaCalculator currentShares={12} currentAvgCostUsd={187.4} currentPriceUsd={333.74} />);

    fireEvent.change(screen.getByLabelText(/add investment/i), { target: { value: '1000' } });

    const expectedNewShares = 12 + 1000 / 333.74;
    const expectedTotalCost = 12 * 187.4 + 1000;
    const expectedAvgCost = expectedTotalCost / expectedNewShares;

    expect(screen.getByText(new RegExp(expectedAvgCost.toFixed(2)))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(expectedNewShares.toFixed(2)))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(expectedTotalCost.toFixed(2)))).toBeInTheDocument();
  });

  it('shows the current position unchanged before any investment is entered', () => {
    render(<DcaCalculator currentShares={12} currentAvgCostUsd={187.4} currentPriceUsd={333.74} />);

    expect(screen.getByText(/187.40/)).toBeInTheDocument();
  });
});

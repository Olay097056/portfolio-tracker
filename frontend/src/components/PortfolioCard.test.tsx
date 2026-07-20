import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PortfolioCard } from './PortfolioCard';

const portfolio = { id: 1, name: 'DIME', cash_usd: 250, target_allocation_pct: 70, created_at: '2026-01-01T00:00:00Z' };

describe('PortfolioCard', () => {
  it('renders the portfolio name, cash, and target allocation', () => {
    render(<PortfolioCard portfolio={portfolio} onDelete={vi.fn()} />);

    expect(screen.getByText('DIME')).toBeInTheDocument();
    expect(screen.getByText(/250/)).toBeInTheDocument();
    expect(screen.getByText(/70/)).toBeInTheDocument();
  });

  it('renders "no target set" when target_allocation_pct is null', () => {
    render(<PortfolioCard portfolio={{ ...portfolio, target_allocation_pct: null }} onDelete={vi.fn()} />);

    expect(screen.getByText(/no target set/i)).toBeInTheDocument();
  });

  it('calls onDelete with the portfolio id when the delete button is clicked', () => {
    const onDelete = vi.fn();
    render(<PortfolioCard portfolio={portfolio} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(onDelete).toHaveBeenCalledWith(1);
  });
});

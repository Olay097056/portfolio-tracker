import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AddPortfolioForm } from './AddPortfolioForm';

describe('AddPortfolioForm', () => {
  it('calls onSubmit with the entered name and cash on submit', () => {
    const onSubmit = vi.fn();
    render(<AddPortfolioForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Speculative' } });
    fireEvent.change(screen.getByLabelText(/cash/i), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /add portfolio/i }));

    expect(onSubmit).toHaveBeenCalledWith({ name: 'Speculative', cash_usd: 100 });
  });

  it('does not call onSubmit when the name is empty', () => {
    const onSubmit = vi.fn();
    render(<AddPortfolioForm onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: /add portfolio/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});

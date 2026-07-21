import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AddPortfolioForm } from './AddPortfolioForm';

describe('AddPortfolioForm', () => {
  it('calls onSubmit with the entered name and cash on submit', async () => {
    const onSubmit = vi.fn();
    render(<AddPortfolioForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Speculative' } });
    fireEvent.change(screen.getByLabelText(/cash/i), { target: { value: '100' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add portfolio/i }));
    });

    expect(onSubmit).toHaveBeenCalledWith({ name: 'Speculative', cash_usd: 100 });
  });

  it('does not call onSubmit when the name is empty', async () => {
    const onSubmit = vi.fn();
    render(<AddPortfolioForm onSubmit={onSubmit} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add portfolio/i }));
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not clear the name field when onSubmit rejects', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('boom'));
    render(<AddPortfolioForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Speculative' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add portfolio/i }));
    });

    expect(screen.getByLabelText(/name/i)).toHaveValue('Speculative');
  });

  it('clears the name field when onSubmit succeeds', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AddPortfolioForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Speculative' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add portfolio/i }));
    });

    expect(screen.getByLabelText(/name/i)).toHaveValue('');
  });
});

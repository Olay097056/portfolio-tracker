import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AddHoldingForm } from './AddHoldingForm';

describe('AddHoldingForm', () => {
  it('calls onSubmit with ticker, shares, and avg cost on submit', async () => {
    const onSubmit = vi.fn();
    render(<AddHoldingForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    fireEvent.change(screen.getByLabelText(/shares/i), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(/average cost/i), { target: { value: '187.4' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add holding/i }));
    });

    expect(onSubmit).toHaveBeenCalledWith({ ticker: 'AAPL', shares: 12, avg_cost_usd: 187.4 });
  });

  it('does not call onSubmit when ticker is empty', async () => {
    const onSubmit = vi.fn();
    render(<AddHoldingForm onSubmit={onSubmit} />);

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/shares/i), { target: { value: '12' } });
      fireEvent.click(screen.getByRole('button', { name: /add holding/i }));
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not clear fields when onSubmit rejects', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('boom'));
    render(<AddHoldingForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    fireEvent.change(screen.getByLabelText(/shares/i), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(/average cost/i), { target: { value: '187.4' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add holding/i }));
    });

    expect(screen.getByLabelText(/ticker/i)).toHaveValue('AAPL');
  });

  it('clears fields when onSubmit succeeds', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AddHoldingForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    fireEvent.change(screen.getByLabelText(/shares/i), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(/average cost/i), { target: { value: '187.4' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add holding/i }));
    });

    expect(screen.getByLabelText(/ticker/i)).toHaveValue('');
  });
});

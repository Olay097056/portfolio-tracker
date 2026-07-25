import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AddWatchlistItemForm } from './AddWatchlistItemForm';

describe('AddWatchlistItemForm', () => {
  it('calls onSubmit with the upper-cased ticker and trimmed category on submit', async () => {
    const onSubmit = vi.fn();
    render(<AddWatchlistItemForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'vti' } });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: '  Core  ' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add to watchlist/i }));
    });

    expect(onSubmit).toHaveBeenCalledWith({ ticker: 'VTI', category: 'Core' });
  });

  it('sends category as null when the category field is left blank', async () => {
    const onSubmit = vi.fn();
    render(<AddWatchlistItemForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'VTI' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add to watchlist/i }));
    });

    expect(onSubmit).toHaveBeenCalledWith({ ticker: 'VTI', category: null });
  });

  it('does not call onSubmit when the ticker is empty', async () => {
    const onSubmit = vi.fn();
    render(<AddWatchlistItemForm onSubmit={onSubmit} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add to watchlist/i }));
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not clear the ticker field when onSubmit rejects', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('boom'));
    render(<AddWatchlistItemForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'VTI' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add to watchlist/i }));
    });

    expect(screen.getByLabelText('Ticker')).toHaveValue('VTI');
  });

  it('clears both fields when onSubmit succeeds', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AddWatchlistItemForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'VTI' } });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Core' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add to watchlist/i }));
    });

    expect(screen.getByLabelText('Ticker')).toHaveValue('');
    expect(screen.getByLabelText(/category/i)).toHaveValue('');
  });
});

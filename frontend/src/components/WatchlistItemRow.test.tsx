import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WatchlistItemRow } from './WatchlistItemRow';

const item = { id: 1, ticker: 'VTI', category: 'Core', created_at: '2026-01-01T00:00:00Z' };

describe('WatchlistItemRow', () => {
  it('renders the ticker and category', () => {
    render(<WatchlistItemRow item={item} onDelete={vi.fn()} />);

    expect(screen.getByText('VTI')).toBeInTheDocument();
    expect(screen.getByText('Core')).toBeInTheDocument();
  });

  it('renders a placeholder when category is null', () => {
    render(<WatchlistItemRow item={{ ...item, category: null }} onDelete={vi.fn()} />);

    expect(screen.getByText(/no category/i)).toBeInTheDocument();
  });

  it('calls onDelete with the item id when Remove is clicked', () => {
    const onDelete = vi.fn();
    render(<WatchlistItemRow item={item} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: /remove/i }));

    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it("styles the Remove button as a warning action, matching the app's Delete-button convention", () => {
    render(<WatchlistItemRow item={item} onDelete={vi.fn()} />);

    expect(screen.getByRole('button', { name: /remove/i })).toHaveStyle({ color: 'var(--red)' });
  });
});

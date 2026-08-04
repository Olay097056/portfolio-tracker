// frontend/src/components/ZoneList.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Zone } from '../api/types';
import { ZONE_STYLE } from '../utils/zoneStyle';
import { ZoneList } from './ZoneList';

const autoZone: Zone = { id: null, price: 95, kind: 'support', strength: 3, source: 'auto' };
const manualZone: Zone = { id: 5, price: 100, kind: 'freestyle', strength: null, source: 'manual' };

describe('ZoneList', () => {
  it('shows a message when there are no zones', () => {
    render(<ZoneList zones={[]} onEditPrice={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText(/no support\/resistance zones/i)).toBeInTheDocument();
  });

  it('shows an auto zone as read-only price text with no edit or delete controls', () => {
    render(<ZoneList zones={[autoZone]} onEditPrice={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText('95.00')).toBeInTheDocument();
    expect(screen.getByText('support')).toBeInTheDocument();
    expect(screen.queryByLabelText(/support zone price/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('shows a manual zone with an editable price input and a delete button', () => {
    render(<ZoneList zones={[manualZone]} onEditPrice={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByLabelText(/freestyle zone price/i)).toHaveValue(100);
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('calls onEditPrice with the zone id and the new price when the price input loses focus with a changed value', () => {
    const onEditPrice = vi.fn();
    render(<ZoneList zones={[manualZone]} onEditPrice={onEditPrice} onDelete={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/freestyle zone price/i), { target: { value: '103' } });
    fireEvent.blur(screen.getByLabelText(/freestyle zone price/i));

    expect(onEditPrice).toHaveBeenCalledWith(5, 103);
  });

  it('does not call onEditPrice when the price input loses focus with the value unchanged', () => {
    const onEditPrice = vi.fn();
    render(<ZoneList zones={[manualZone]} onEditPrice={onEditPrice} onDelete={vi.fn()} />);

    fireEvent.blur(screen.getByLabelText(/freestyle zone price/i));

    expect(onEditPrice).not.toHaveBeenCalled();
  });

  it('calls onDelete with the zone id when the delete button is clicked', () => {
    const onDelete = vi.fn();
    render(<ZoneList zones={[manualZone]} onEditPrice={vi.fn()} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(onDelete).toHaveBeenCalledWith(5);
  });

  it('disables the price input and delete button when disabled is true', () => {
    render(<ZoneList zones={[manualZone]} onEditPrice={vi.fn()} onDelete={vi.fn()} disabled={true} />);

    expect(screen.getByLabelText(/freestyle zone price/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled();
  });

  it('does not disable controls when disabled is omitted', () => {
    render(<ZoneList zones={[manualZone]} onEditPrice={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByLabelText(/freestyle zone price/i)).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /delete/i })).not.toBeDisabled();
  });

  it("shows a color-coded badge for each zone's kind, matching the shared zone-style color", () => {
    const { container } = render(<ZoneList zones={[autoZone, manualZone]} onEditPrice={vi.fn()} onDelete={vi.fn()} />);

    const badges = container.querySelectorAll('[data-testid="zone-kind-badge"]');
    expect(badges).toHaveLength(2);
    expect(badges[0]).toHaveStyle({ backgroundColor: ZONE_STYLE.support.color });
    expect(badges[1]).toHaveStyle({ backgroundColor: ZONE_STYLE.freestyle.color });
  });
});

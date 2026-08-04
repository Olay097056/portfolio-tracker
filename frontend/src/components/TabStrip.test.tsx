import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TabStrip } from './TabStrip';

describe('TabStrip', () => {
  const tabs = [
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Beta' },
    { id: 'c', label: 'Gamma' },
  ] as const;

  it('renders one button per tab with the active tab pressed', () => {
    render(<TabStrip tabs={tabs} activeTab="b" onChange={() => {}} />);

    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Beta' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Gamma' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with the clicked tab id', () => {
    const onChange = vi.fn();
    render(<TabStrip tabs={tabs} activeTab="a" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Gamma' }));

    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('does not call onChange when the already-active tab is clicked', () => {
    const onChange = vi.fn();
    render(<TabStrip tabs={tabs} activeTab="a" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));

    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('highlights only the active tab with the theme accent color', () => {
    render(<TabStrip tabs={tabs} activeTab="b" onChange={() => {}} />);

    expect(screen.getByRole('button', { name: 'Beta' })).toHaveStyle({ color: 'var(--primary)' });
    expect(screen.getByRole('button', { name: 'Alpha' })).not.toHaveStyle({ color: 'var(--primary)' });
    expect(screen.getByRole('button', { name: 'Gamma' })).not.toHaveStyle({ color: 'var(--primary)' });
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToolsPage } from './ToolsPage';

describe('ToolsPage', () => {
  it('shows DCA Projection by default and switches between sub-tabs', () => {
    render(<ToolsPage />);

    expect(screen.getByRole('heading', { name: 'Tools' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Passive Income/i }));
    expect(screen.getAllByRole('heading', { name: /Passive Income/i }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Portfolio Builder/i }));
    expect(screen.getAllByRole('heading', { name: /Portfolio Builder/i }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Investor Tracker/i }));
    expect(screen.getByRole('heading', { name: /Super Investor Tracker/i })).toBeInTheDocument();
  });
});

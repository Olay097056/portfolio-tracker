import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToolsPage } from './ToolsPage';

describe('ToolsPage', () => {
  it('shows DCA Projection by default and switches between all four sub-tabs', () => {
    render(<ToolsPage />);

    expect(screen.getByRole('heading', { name: 'DCA Projection' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Passive Income' }));
    expect(screen.getByRole('heading', { name: 'Passive Income' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'DCA Projection' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Portfolio Builder' }));
    expect(screen.getByRole('heading', { name: 'Portfolio Builder' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Passive Income' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'ETF Comparison' }));
    expect(screen.getByRole('heading', { name: 'ETF Comparison' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Portfolio Builder' })).not.toBeInTheDocument();
  });
});

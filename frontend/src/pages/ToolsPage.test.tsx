import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToolsPage } from './ToolsPage';

describe('ToolsPage', () => {
  it('shows DCA Projection by default and switches to Passive Income on click', () => {
    render(<ToolsPage />);

    expect(screen.getByRole('heading', { name: 'DCA Projection' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Passive Income' }));

    expect(screen.getByRole('heading', { name: 'Passive Income' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'DCA Projection' })).not.toBeInTheDocument();
  });
});

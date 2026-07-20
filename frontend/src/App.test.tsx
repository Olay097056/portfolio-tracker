import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from './api/client';
import { App } from './App';

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the app title and the portfolios page', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Portfolio Tracker' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/no portfolios yet/i)).toBeInTheDocument());
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from './api/client';
import { App } from './App';

describe('App', () => {
  beforeEach(() => {
    vi.spyOn(client, 'getPortfolioSummary').mockResolvedValue({
      id: 1,
      name: '',
      cash_usd: 0,
      target_allocation_pct: null,
      holdings_value: 0,
      total_value: 0,
      unrealized_pnl: 0,
      realized_pnl: 0,
      holdings: [],
    });
  });

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

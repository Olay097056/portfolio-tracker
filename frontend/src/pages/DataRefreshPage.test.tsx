import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import type { RefreshStatus } from '../api/types';
import { DataRefreshPage } from './DataRefreshPage';

const idle: RefreshStatus = {
  status: 'idle', total: null, completed: 0, skipped: 0,
  currentSymbol: null, startedAt: null, finishedAt: null, errorMessage: null,
};

describe('DataRefreshPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the Screener refresh card, wired to its status/start functions', async () => {
    const getScreenerStatus = vi.spyOn(client, 'getScreenerRefreshStatus').mockResolvedValue(idle);

    render(<DataRefreshPage />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Stock Screener Data' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Refresh Screener Data' })).toBeInTheDocument();
    await waitFor(() => expect(getScreenerStatus).toHaveBeenCalled());
  });
});

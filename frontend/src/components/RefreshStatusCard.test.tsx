import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RefreshStatus } from '../api/types';
import { RefreshStatusCard } from './RefreshStatusCard';

const idle: RefreshStatus = {
  status: 'idle', total: null, completed: 0, skipped: 0,
  currentSymbol: null, startedAt: null, finishedAt: null, errorMessage: null,
};

const defaultProps = {
  title: 'Widget Data',
  description: 'Refreshes widgets.',
  startLabel: 'Refresh Widget Data',
  runningLabel: 'Refresh in progress…',
  completedLabel: 'Widget data refreshed',
  itemNoun: 'widgets',
};

describe('RefreshStatusCard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a heading inside a card', async () => {
    const getStatus = vi.fn().mockResolvedValue(idle);

    const { container } = render(
      <RefreshStatusCard {...defaultProps} getStatus={getStatus} startRefresh={vi.fn()} />,
    );

    await waitFor(() => expect(container.querySelector('.card')).not.toBeNull());
    expect(screen.getByRole('heading', { name: 'Widget Data' })).toBeInTheDocument();
  });

  it('shows an enabled button and no progress bar when idle', async () => {
    const getStatus = vi.fn().mockResolvedValue(idle);

    render(<RefreshStatusCard {...defaultProps} getStatus={getStatus} startRefresh={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole('button', { name: /refresh widget data/i })).not.toBeDisabled());
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('resumes showing progress on mount when a refresh is already running', async () => {
    const getStatus = vi.fn().mockResolvedValue({
      status: 'running', total: 100, completed: 40, skipped: 1,
      currentSymbol: 'AAPL', startedAt: '2026-08-05T00:00:00Z', finishedAt: null, errorMessage: null,
    });

    render(<RefreshStatusCard {...defaultProps} getStatus={getStatus} startRefresh={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40'));
    expect(screen.getByRole('button', { name: /refresh in progress/i })).toBeDisabled();
    expect(screen.getByText('Current: AAPL')).toBeInTheDocument();
  });

  it('clicking the button starts a refresh and shows a progress bar', async () => {
    const getStatus = vi.fn().mockResolvedValue(idle);
    const startRefresh = vi.fn().mockResolvedValue({
      status: 'running', total: null, completed: 0, skipped: 0,
      currentSymbol: null, startedAt: '2026-08-05T00:00:00Z', finishedAt: null, errorMessage: null,
    });

    render(<RefreshStatusCard {...defaultProps} getStatus={getStatus} startRefresh={startRefresh} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /refresh widget data/i })).not.toBeDisabled());

    fireEvent.click(screen.getByRole('button', { name: /refresh widget data/i }));

    await waitFor(() => expect(screen.getByText(/fetching ticker universe/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /refresh in progress/i })).toBeDisabled();
  });

  it('polls for status while running and updates the progress bar', async () => {
    const getStatus = vi.fn()
      .mockResolvedValueOnce({
        status: 'running', total: 10, completed: 2, skipped: 0,
        currentSymbol: 'AAA', startedAt: '2026-08-05T00:00:00Z', finishedAt: null, errorMessage: null,
      })
      .mockResolvedValueOnce({
        status: 'running', total: 10, completed: 5, skipped: 0,
        currentSymbol: 'BBB', startedAt: '2026-08-05T00:00:00Z', finishedAt: null, errorMessage: null,
      });

    render(<RefreshStatusCard {...defaultProps} getStatus={getStatus} startRefresh={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    await waitFor(() => expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50'));
  });

  it('stops polling and shows a success badge when the refresh completes', async () => {
    const getStatus = vi.fn()
      .mockResolvedValueOnce({
        status: 'running', total: 2, completed: 1, skipped: 0,
        currentSymbol: 'AAA', startedAt: '2026-08-05T00:00:00Z', finishedAt: null, errorMessage: null,
      })
      .mockResolvedValueOnce({
        status: 'completed', total: 2, completed: 2, skipped: 0,
        currentSymbol: null, startedAt: '2026-08-05T00:00:00Z', finishedAt: '2026-08-05T01:00:00Z', errorMessage: null,
      });

    render(<RefreshStatusCard {...defaultProps} getStatus={getStatus} startRefresh={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/1 \/ 2 widgets/)).toBeInTheDocument());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    await waitFor(() => expect(screen.getByText('Widget data refreshed')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /refresh widget data/i })).not.toBeDisabled();
  });

  it('shows an error banner and re-enables the button when the refresh fails', async () => {
    const getStatus = vi.fn().mockResolvedValue({
      status: 'error', total: 5, completed: 2, skipped: 0,
      currentSymbol: null, startedAt: '2026-08-05T00:00:00Z', finishedAt: '2026-08-05T00:05:00Z',
      errorMessage: 'provider is down',
    });

    render(<RefreshStatusCard {...defaultProps} getStatus={getStatus} startRefresh={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('provider is down')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /refresh widget data/i })).not.toBeDisabled();
  });

  it('shows a load error and stops polling when getStatus rejects', async () => {
    const getStatus = vi.fn().mockRejectedValue(new Error('network down'));

    render(<RefreshStatusCard {...defaultProps} getStatus={getStatus} startRefresh={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('network down')).toBeInTheDocument());
  });
});

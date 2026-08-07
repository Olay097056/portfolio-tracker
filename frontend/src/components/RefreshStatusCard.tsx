import { useEffect, useRef, useState } from 'react';
import type { RefreshStatus } from '../api/types';

const POLL_INTERVAL_MS = 2000;

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

interface RefreshStatusCardProps {
  title: string;
  description: string;
  startLabel: string;
  runningLabel: string;
  completedLabel: string;
  itemNoun: string; // e.g. "symbols" -- used in "N / M {itemNoun}"
  getStatus: () => Promise<RefreshStatus>;
  startRefresh: () => Promise<RefreshStatus>;
}

/** A card with a start button and a progress bar for any background
 * refresh-with-progress feature (Screener fundamentals, technical signals,
 * ...) -- the shared shell around whichever `getStatus`/`startRefresh` pair
 * a given feature provides. */
export function RefreshStatusCard({
  title,
  description,
  startLabel,
  runningLabel,
  completedLabel,
  itemNoun,
  getStatus,
  startRefresh,
}: RefreshStatusCardProps) {
  const [status, setStatus] = useState<RefreshStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollOnce = async (): Promise<RefreshStatus | null> => {
    try {
      const next = await getStatus();
      setStatus(next);
      setLoadError(null);
      if (next.status !== 'running') {
        stopPolling();
      }
      return next;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load refresh status');
      stopPolling();
      return null;
    }
  };

  const startPolling = () => {
    stopPolling();
    pollRef.current = setInterval(pollOnce, POLL_INTERVAL_MS);
  };

  useEffect(() => {
    // On mount, check whether a refresh is already in progress (e.g. started
    // from another tab, or this page was reloaded mid-refresh) and resume
    // showing its progress rather than assuming we're starting from idle.
    pollOnce().then((initial) => {
      if (initial?.status === 'running') {
        startPolling();
      }
    });

    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStart = async () => {
    setLoadError(null);
    try {
      const next = await startRefresh();
      setStatus(next);
      if (next.status === 'running') {
        startPolling();
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to start refresh');
    }
  };

  const isRunning = status?.status === 'running';
  const total = status?.total ?? null;
  const completed = status?.completed ?? 0;
  const percent = total && total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  return (
    <div className="card">
      <h3>{title}</h3>
      <p style={{ color: 'var(--muted)' }}>{description}</p>

      {loadError && (
        <div role="alert" className="badge badge-red" style={{ display: 'block', marginBottom: '12px' }}>
          {loadError}
        </div>
      )}

      <button type="button" onClick={handleStart} disabled={isRunning}>
        {isRunning ? runningLabel : startLabel}
      </button>

      {status && status.status !== 'idle' && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.85rem' }}>
            <span>
              {status.status === 'running' && total
                ? `${completed} / ${total} ${itemNoun}`
                : status.status === 'running'
                  ? 'Fetching ticker universe…'
                  : status.status === 'completed'
                    ? `Done — ${status.completed} fetched, ${status.skipped} skipped`
                    : status.status === 'error'
                      ? 'Refresh failed'
                      : ''}
            </span>
            {total ? <span>{percent}%</span> : null}
          </div>

          <div className="progress-track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-fill" style={{ width: `${status.status === 'completed' ? 100 : percent}%` }} />
          </div>

          <div style={{ marginTop: '10px', fontSize: '0.85rem', color: 'var(--muted)' }}>
            {status.currentSymbol && status.status === 'running' && <div>Current: {status.currentSymbol}</div>}
            <div>Started: {formatTimestamp(status.startedAt)}</div>
            {status.finishedAt && <div>Finished: {formatTimestamp(status.finishedAt)}</div>}
          </div>

          {status.status === 'error' && status.errorMessage && (
            <div role="alert" className="badge badge-red" style={{ display: 'block', marginTop: '10px' }}>
              {status.errorMessage}
            </div>
          )}

          {status.status === 'completed' && (
            <div className="badge badge-green" style={{ display: 'inline-block', marginTop: '10px' }}>
              {completedLabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

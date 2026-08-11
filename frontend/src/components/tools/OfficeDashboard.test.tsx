import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OfficeDashboard } from './OfficeDashboard';
import * as client from '../../api/client';

vi.mock('../../api/client', () => ({ getJobStatus: vi.fn() }));

// Mock canvas + WebGL
beforeEach(() => {
  vi.stubGlobal('HTMLCanvasElement', class {
    getContext() { return null; }
  });
});

describe('OfficeDashboard', () => {
  beforeEach(() => {
    vi.mocked(client.getJobStatus).mockResolvedValue({
      recent_runs: [{ id: 1, job_name: 'trade-tick', started_at: null, finished_at: '2026-08-12T14:00:00', status: 'finished', detail: null }],
      running: false,
    } as never);
  });

  it('renders 3D canvas + job runs', async () => {
    render(<OfficeDashboard />);
    await waitFor(() => expect(screen.getByText('trade-tick')).toBeTruthy());
    expect(screen.getByText('งานระบบล่าสุด')).toBeTruthy();
    expect(screen.getByText('ระบบว่าง')).toBeTruthy();
  });

  it('shows instructions', async () => {
    render(<OfficeDashboard />);
    await waitFor(() => expect(screen.getByText(/ลาก=หมุน/)).toBeTruthy());
  });
});

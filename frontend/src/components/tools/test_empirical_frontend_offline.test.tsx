// frontend/src/components/tools/test_empirical_frontend_offline.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { StockScreener } from './StockScreener';
import { SCREENER_STOCKS } from '../../data/screenerStocks';

describe('Empirical Verification: StockScreener Mock Fetch & Offline Resilience', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('1. Mock Fetch Handling: returns paginated stocks when API responds with 200 OK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            total: SCREENER_STOCKS.length,
            page: 1,
            pageSize: 50,
            stocks: SCREENER_STOCKS,
            refreshedAt: '2026-08-05T08:00:00Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    render(<StockScreener currency="USD" fxRate={33.38} />);

    await screen.findByText('NVDA');
    expect(screen.getByText('NVDA')).toBeInTheDocument();
    expect(screen.queryByText(/เกิดข้อผิดพลาด/i)).not.toBeInTheDocument();
  });

  it('2. Offline Behavior: handles network error (Failed to fetch) and renders Error banner with Retry button', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    render(<StockScreener currency="USD" fxRate={33.38} />);

    // Verify Error Alert banner appears with error message
    await screen.findByText(/เกิดข้อผิดพลาดในการโหลดข้อมูล \(Failed to fetch\)/i);
    expect(screen.getByText(/เกิดข้อผิดพลาดในการโหลดข้อมูล \(Failed to fetch\)/i)).toBeInTheDocument();

    // Verify Retry button ("ลองอีกครั้ง") is rendered
    const retryBtn = screen.getByRole('button', { name: /ลองอีกครั้ง/i });
    expect(retryBtn).toBeInTheDocument();

    // Change mock to succeed on retry
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          total: 1,
          page: 1,
          pageSize: 50,
          stocks: [SCREENER_STOCKS[0]],
          refreshedAt: '2026-08-05T08:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    // Click Retry button
    fireEvent.click(retryBtn);

    // Verify error banner disappears and stock table renders
    await waitFor(() => {
      expect(screen.queryByText(/เกิดข้อผิดพลาดในการโหลดข้อมูล/i)).not.toBeInTheDocument();
      expect(screen.getByText('NVDA')).toBeInTheDocument();
    });
  });

  it('3. HTTP Server Error Behavior: handles 500 Internal Server Error status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Internal Server Error' }), {
          status: 500,
          statusText: 'Internal Server Error',
        })
      )
    );

    render(<StockScreener currency="USD" fxRate={33.38} />);

    await screen.findByText(/เกิดข้อผิดพลาดในการโหลดข้อมูล \(Status 500\)/i);
    expect(screen.getByText(/เกิดข้อผิดพลาดในการโหลดข้อมูล \(Status 500\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ลองอีกครั้ง/i })).toBeInTheDocument();
  });
});

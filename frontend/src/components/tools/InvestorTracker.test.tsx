import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as client from '../../api/client';
import { InvestorTracker } from './InvestorTracker';
import type { InvestorProfile, NewHoldingActivity } from '../../api/types';

function makeInvestor(overrides: Partial<InvestorProfile>): InvestorProfile {
  return {
    id: '1',
    name: 'Warren Buffett',
    slug: 'warren-buffett',
    fund_name: 'Berkshire Hathaway',
    performance_1y_pct: 12.5,
    portfolio_value_usd: '300.0B',
    portfolio_value_num: 300_000_000_000,
    description: 'Value investing.',
    avatar_url: '',
    last_13f_filing: 'SEC Form 13F (Q1 2026)',
    top_holdings: [
      { id: 'h1', name: 'Apple Inc.', ticker: 'AAPL', portfolio_percent: 40, avg_buy_price: 50, current_price: 200, gain_percent: 300, activity_period: 'Q1 2026', activity_text: 'Held' },
    ],
    ...overrides,
  };
}

const newHoldings: NewHoldingActivity[] = [];

describe('InvestorTracker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the real fetched investors, not a fabricated AUM figure', async () => {
    const investors = [
      makeInvestor({ id: '1', name: 'Warren Buffett', portfolio_value_num: 300_000_000_000 }),
      makeInvestor({ id: '2', name: 'Cathie Wood', slug: 'cathie-wood', portfolio_value_num: 8_500_000_000 }),
    ];
    vi.spyOn(client, 'listInvestors').mockResolvedValue(investors);
    vi.spyOn(client, 'listNewHoldings').mockResolvedValue(newHoldings);
    vi.spyOn(client, 'getInvestorsStatus').mockResolvedValue({ last_fetched_at: '07/08/2026', fetch_timestamp: 0, investors_count: 2, data_provider: 'test' });

    render(<InvestorTracker />);

    await waitFor(() => expect(screen.getByText('Warren Buffett')).toBeInTheDocument());
    expect(screen.getByText('Cathie Wood')).toBeInTheDocument();

    // 300B + 8.5B = 308.5B — computed, not the old hardcoded "$350.2B".
    expect(screen.getByText('$308.5B')).toBeInTheDocument();
    expect(screen.queryByText('$350.2B')).not.toBeInTheDocument();
  });

  it('shows the most common real filing period across fetched investors, not a fixed "Q1 2026"', async () => {
    const investors = [
      makeInvestor({ id: '1', slug: 'a', last_13f_filing: 'SEC Form 13F (Q3 2025)' }),
      makeInvestor({ id: '2', slug: 'b', last_13f_filing: 'SEC Form 13F (Q3 2025)' }),
      makeInvestor({ id: '3', slug: 'c', last_13f_filing: 'SEC Form 13F (Q1 2026)' }),
    ];
    vi.spyOn(client, 'listInvestors').mockResolvedValue(investors);
    vi.spyOn(client, 'listNewHoldings').mockResolvedValue(newHoldings);
    vi.spyOn(client, 'getInvestorsStatus').mockResolvedValue({ last_fetched_at: '', fetch_timestamp: 0, investors_count: 3, data_provider: 'test' });

    render(<InvestorTracker />);

    // Q3 2025 appears twice, Q1 2026 once — the majority wins.
    expect(await screen.findByText('Q3 2025')).toBeInTheDocument();
  });

  it('re-fetches with the search term when the user types in the search box', async () => {
    const listInvestorsSpy = vi.spyOn(client, 'listInvestors').mockResolvedValue([makeInvestor({})]);
    vi.spyOn(client, 'listNewHoldings').mockResolvedValue(newHoldings);
    vi.spyOn(client, 'getInvestorsStatus').mockResolvedValue({ last_fetched_at: '', fetch_timestamp: 0, investors_count: 1, data_provider: 'test' });

    render(<InvestorTracker />);
    await waitFor(() => expect(screen.getByText('Warren Buffett')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/ค้นหานักลงทุน/), { target: { value: 'Cathie' } });

    await waitFor(() => expect(listInvestorsSpy).toHaveBeenLastCalledWith('Cathie', 'performance'));
  });

  it('re-fetches with the selected sort option', async () => {
    const listInvestorsSpy = vi.spyOn(client, 'listInvestors').mockResolvedValue([makeInvestor({})]);
    vi.spyOn(client, 'listNewHoldings').mockResolvedValue(newHoldings);
    vi.spyOn(client, 'getInvestorsStatus').mockResolvedValue({ last_fetched_at: '', fetch_timestamp: 0, investors_count: 1, data_provider: 'test' });

    render(<InvestorTracker />);
    await waitFor(() => expect(screen.getByText('Warren Buffett')).toBeInTheDocument());

    fireEvent.change(screen.getByDisplayValue(/ผลตอบแทน 1 ปี/), { target: { value: 'portfolio_value' } });

    await waitFor(() => expect(listInvestorsSpy).toHaveBeenLastCalledWith('', 'portfolio_value'));
  });

  it('opens the detail modal with the full holdings breakdown when "View full portfolio" is clicked', async () => {
    const investor = makeInvestor({});
    vi.spyOn(client, 'listInvestors').mockResolvedValue([investor]);
    vi.spyOn(client, 'listNewHoldings').mockResolvedValue(newHoldings);
    vi.spyOn(client, 'getInvestorsStatus').mockResolvedValue({ last_fetched_at: '', fetch_timestamp: 0, investors_count: 1, data_provider: 'test' });
    vi.spyOn(client, 'getInvestorProfile').mockResolvedValue(investor);

    render(<InvestorTracker />);
    await waitFor(() => expect(screen.getByText('Warren Buffett')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /ดูพอร์ตทั้งหมด/ }));

    await waitFor(() => expect(client.getInvestorProfile).toHaveBeenCalledWith('warren-buffett'));
    expect(await screen.findByText(/13F Holdings Breakdown/)).toBeInTheDocument();
  });

  it('recovers to an empty, non-broken state rather than an unhandled error when every API call fails', async () => {
    // Mirrors the backend's own network-fallback test (test_investors_router.py):
    // there, a failed live fetch still returns 200 with real fallback data.
    // Here at the component boundary, each call is individually .catch(() => [])'d
    // before Promise.all — so a full outage must never surface as a crash or alert.
    vi.spyOn(client, 'listInvestors').mockRejectedValue(new Error('network down'));
    vi.spyOn(client, 'listNewHoldings').mockRejectedValue(new Error('network down'));
    vi.spyOn(client, 'getInvestorsStatus').mockRejectedValue(new Error('network down'));

    render(<InvestorTracker />);

    await waitFor(() => expect(screen.queryByText(/Loading super investor tracker/)).not.toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(/กำลังแสดง/)).toBeInTheDocument();
  });

  it('renders normally when listInvestors resolves with the backend\'s static fallback dataset', async () => {
    // The backend falls back to a static seed list (INVESTORS_DATABASE) on a live-fetch
    // failure but still returns 200 — from this component's perspective that's just a
    // normal successful response, so it should render exactly like any other investor list.
    const fallbackInvestor = makeInvestor({ id: 'fallback-1', name: 'Michael Burry', slug: 'michael-burry' });
    vi.spyOn(client, 'listInvestors').mockResolvedValue([fallbackInvestor]);
    vi.spyOn(client, 'listNewHoldings').mockResolvedValue(newHoldings);
    vi.spyOn(client, 'getInvestorsStatus').mockResolvedValue({ last_fetched_at: '', fetch_timestamp: 0, investors_count: 1, data_provider: 'Official U.S. SEC EDGAR API & Konbalongtun Network' });

    render(<InvestorTracker />);

    await waitFor(() => expect(screen.getByText('Michael Burry')).toBeInTheDocument());
  });
});

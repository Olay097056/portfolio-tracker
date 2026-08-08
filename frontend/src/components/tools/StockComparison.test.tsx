import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as client from '../../api/client';
import type { ComparableStock } from '../../api/types';
import { StockComparison, MAX_COMPARE_STOCKS } from './StockComparison';

function makeStock(overrides: Partial<ComparableStock> = {}): ComparableStock {
  return {
    symbol: 'AAPL',
    name: 'Apple Inc',
    sector: 'Technology',
    industry: 'Consumer Electronics',
    logo_url: null,
    price: 313.33,
    target_price: 327.82,
    analyst_target_upside_pct: 4.62,
    metrics: {
      market_cap: '4537070000000',
      pe_ratio: '35.43',
      perf_year: '48.82%',
      profit_margin: '27.62',
      rsi14: '43.24',
    },
    ...overrides,
  };
}

async function addStock(symbol: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: symbol } });
  // Scoped to the dropdown's own option rows: once a stock is already added, its symbol
  // also appears in the chip list and the table header, so a bare text query is ambiguous.
  const option = await screen.findByRole('option', { name: new RegExp(symbol) });
  fireEvent.mouseDown(option);
}

describe('StockComparison', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the empty state before any stock is picked', () => {
    vi.spyOn(client, 'compareAutocomplete').mockResolvedValue([]);
    render(<StockComparison />);

    expect(screen.getByText('ยังไม่ได้เลือกหุ้น')).toBeInTheDocument();
    expect(screen.getByText(`0/${MAX_COMPARE_STOCKS}`)).toBeInTheDocument();
  });

  it('suggests from konbalongtun\'s universe, not this app\'s own screener search', async () => {
    const compareSpy = vi.spyOn(client, 'compareAutocomplete').mockResolvedValue([
      { symbol: 'AAPL', name: 'Apple Inc', sector: 'Technology', logo_url: null },
    ]);
    const screenerSpy = vi.spyOn(client, 'searchStocks').mockResolvedValue([]);

    render(<StockComparison />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'AAPL' } });

    await waitFor(() => expect(compareSpy).toHaveBeenCalledWith('AAPL'));
    expect(screenerSpy).not.toHaveBeenCalled();
  });

  it('adds a picked stock as a column of real metric values', async () => {
    vi.spyOn(client, 'compareAutocomplete').mockResolvedValue([
      { symbol: 'AAPL', name: 'Apple Inc', sector: 'Technology', logo_url: null },
    ]);
    vi.spyOn(client, 'getCompareStock').mockResolvedValue(makeStock());

    render(<StockComparison />);
    await addStock('AAPL');

    await waitFor(() => expect(screen.getByText(`1/${MAX_COMPARE_STOCKS}`)).toBeInTheDocument());
    expect(screen.getByText('4537070000000')).toBeInTheDocument();
    expect(screen.getByText('35.43')).toBeInTheDocument();
  });

  it('renders "-" for metrics the instrument genuinely lacks, never 0', async () => {
    vi.spyOn(client, 'compareAutocomplete').mockResolvedValue([
      { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', sector: 'Financial', logo_url: null },
    ]);
    vi.spyOn(client, 'getCompareStock').mockResolvedValue(
      makeStock({ symbol: 'VOO', name: 'Vanguard S&P 500 ETF', metrics: { market_cap: '600000000000' } })
    );

    render(<StockComparison />);
    await addStock('VOO');

    await waitFor(() => expect(screen.getByText('600000000000')).toBeInTheDocument());
    // P/E row exists but has no value for an ETF -- must show a dash, not a zero.
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThan(0);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('removes a stock when its chip ✕ is clicked', async () => {
    vi.spyOn(client, 'compareAutocomplete').mockResolvedValue([
      { symbol: 'AAPL', name: 'Apple Inc', sector: 'Technology', logo_url: null },
    ]);
    vi.spyOn(client, 'getCompareStock').mockResolvedValue(makeStock());

    render(<StockComparison />);
    await addStock('AAPL');
    await waitFor(() => expect(screen.getByText(`1/${MAX_COMPARE_STOCKS}`)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'ลบ AAPL' }));

    await waitFor(() => expect(screen.getByText('ยังไม่ได้เลือกหุ้น')).toBeInTheDocument());
  });

  it('refuses to add the same stock twice', async () => {
    vi.spyOn(client, 'compareAutocomplete').mockResolvedValue([
      { symbol: 'AAPL', name: 'Apple Inc', sector: 'Technology', logo_url: null },
    ]);
    const getSpy = vi.spyOn(client, 'getCompareStock').mockResolvedValue(makeStock());

    render(<StockComparison />);
    await addStock('AAPL');
    await waitFor(() => expect(screen.getByText(`1/${MAX_COMPARE_STOCKS}`)).toBeInTheDocument());

    await addStock('AAPL');

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('อยู่ในตารางเปรียบเทียบแล้ว'));
    expect(getSpy).toHaveBeenCalledTimes(1);
  });

  it('surfaces an error when the stock has no comparable data upstream', async () => {
    vi.spyOn(client, 'compareAutocomplete').mockResolvedValue([
      { symbol: 'ZZZZ', name: 'Nothing Inc', sector: null, logo_url: null },
    ]);
    vi.spyOn(client, 'getCompareStock').mockRejectedValue(new Error('404'));

    render(<StockComparison />);
    await addStock('ZZZZ');

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('ไม่พบข้อมูลเปรียบเทียบของ ZZZZ'));
    expect(screen.getByText('ยังไม่ได้เลือกหุ้น')).toBeInTheDocument();
  });

  it('renders a generated summary row built from the real metrics', async () => {
    vi.spyOn(client, 'compareAutocomplete').mockResolvedValue([
      { symbol: 'AAPL', name: 'Apple Inc', sector: 'Technology', logo_url: null },
    ]);
    vi.spyOn(client, 'getCompareStock').mockResolvedValue(makeStock());

    render(<StockComparison />);
    await addStock('AAPL');

    await waitFor(() => expect(screen.getAllByText('สรุป').length).toBeGreaterThan(0));
    expect(screen.getByText(/ซื้อขายที่ P\/E 35\.4 เท่า/)).toBeInTheDocument();
  });

  it('discloses that summaries are this app\'s own, not the upstream API\'s', async () => {
    vi.spyOn(client, 'compareAutocomplete').mockResolvedValue([
      { symbol: 'AAPL', name: 'Apple Inc', sector: 'Technology', logo_url: null },
    ]);
    vi.spyOn(client, 'getCompareStock').mockResolvedValue(makeStock());

    render(<StockComparison />);
    await addStock('AAPL');

    await waitFor(() => expect(screen.getByText(/สร้างจากเกณฑ์ของแอปนี้เอง/)).toBeInTheDocument());
  });
});

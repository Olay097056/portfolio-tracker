import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { DcaProjectionCalculator } from './DcaProjectionCalculator';

describe('DcaProjectionCalculator', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders title, subtitle, and default USD currency badge', () => {
    render(<DcaProjectionCalculator />);

    expect(screen.getByText(/🧮 DCA Calculator/i)).toBeInTheDocument();
    expect(screen.getByText(/จำลองการลงทุนแบบ Dollar-Cost Averaging/i)).toBeInTheDocument();
    expect(screen.getByText(/Active Currency: USD \(\$\)/i)).toBeInTheDocument();
  });

  it('wraps its content in a glass-panel card', () => {
    const { container } = render(<DcaProjectionCalculator />);

    expect(container.querySelector('.card.glass-panel')).not.toBeNull();
  });

  it('toggles active currency between USD and THB with automatic FX rate calculation', () => {
    render(<DcaProjectionCalculator currency="USD" fxRate={33.38} />);

    // Default active currency is USD
    expect(screen.getByText(/Active Currency: USD \(\$\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Initial investment \(USD\)/i)).toHaveValue(3000);

    // Toggle to THB (฿)
    const thbButton = screen.getByRole('button', { name: /THB \(฿\)/i });
    fireEvent.click(thbButton);

    expect(screen.getByText(/Active Currency: THB \(฿\)/i)).toBeInTheDocument();
    // 3000 * 33.38 = 100140
    expect(screen.getByLabelText(/Initial investment \(THB\)/i)).toHaveValue(100140);

    // Toggle back to USD ($)
    const usdButton = screen.getByRole('button', { name: /USD \(\$\)/i });
    fireEvent.click(usdButton);

    expect(screen.getByText(/Active Currency: USD \(\$\)/i)).toBeInTheDocument();
  });

  it('selects stock via Quick Select Pills and updates ticker, yield, and growth', async () => {
    vi.spyOn(client, 'getDcaAvailableTickers').mockResolvedValue([
      { symbol: 'MSFT', name: 'Microsoft', default_yield: 0.7, default_growth: 14.0 },
    ]);

    render(<DcaProjectionCalculator />);

    await waitFor(() => {
      expect(client.getDcaAvailableTickers).toHaveBeenCalled();
    });

    const pillBtn = screen.getByRole('button', { name: /⚡ MSFT/i });
    fireEvent.click(pillBtn);

    expect(screen.getByLabelText(/Ticker \(Optional Auto-fill\)/i)).toHaveValue('MSFT');
    expect(screen.getByLabelText(/Dividend yield/i)).toHaveValue(0.7);
    expect(screen.getByLabelText(/Price growth/i)).toHaveValue(14);
  });

  it('allows manual editing of yield and growth spinbutton inputs', () => {
    render(<DcaProjectionCalculator />);

    const yieldInput = screen.getByLabelText(/Dividend yield/i);
    const growthInput = screen.getByLabelText(/Price growth/i);

    fireEvent.change(yieldInput, { target: { value: '4.2' } });
    fireEvent.change(growthInput, { target: { value: '9.5' } });

    expect(yieldInput).toHaveValue(4.2);
    expect(growthInput).toHaveValue(9.5);
  });

  it('updates projection when interactive sliders and paired numeric inputs are changed', () => {
    render(<DcaProjectionCalculator currency="USD" />);

    const initialInput = screen.getByLabelText(/Initial investment \(USD\)/i);
    const monthlyInput = screen.getByLabelText(/Monthly contribution \(USD\)/i);
    const yearsInput = screen.getByLabelText(/Investment Horizon \(Years: 1–30\)/i);

    fireEvent.change(initialInput, { target: { value: '10000' } });
    fireEvent.change(monthlyInput, { target: { value: '500' } });
    fireEvent.change(yearsInput, { target: { value: '15' } });

    expect(initialInput).toHaveValue(10000);
    expect(monthlyInput).toHaveValue(500);
    expect(yearsInput).toHaveValue(15);
    expect(screen.getByText(/Portfolio value after 15 years/i)).toBeInTheDocument();
  });

  it('renders summary hero banner with total portfolio value and multiplier', () => {
    render(<DcaProjectionCalculator />);

    expect(screen.getByText(/มูลค่าพอร์ตหลัง 10 ปี/i)).toBeInTheDocument();
    expect(screen.getByText(/อัตราเติบโตเงินพอร์ต/i)).toBeInTheDocument();
    expect(screen.getByText(/เงินเพิ่มขึ้น/i)).toBeInTheDocument();
    expect(screen.getByText(/เงินลงทุนรวม:/i)).toBeInTheDocument();
  });

  it('renders income breakdown cards (accumulated net dividend, capital gain, total return + tax info)', () => {
    render(<DcaProjectionCalculator />);

    expect(screen.getByText(/📊 Income Breakdown/i)).toBeInTheDocument();
    expect(screen.getByText(/💰 ปันผลสะสม \(Accumulated Net Div\)/i)).toBeInTheDocument();
    expect(screen.getByText(/📈 กำไรราคา \(Capital Gain\)/i)).toBeInTheDocument();
    expect(screen.getByText(/🎯 กำไรรวม \(Total Return\)/i)).toBeInTheDocument();
    expect(screen.getByText(/ปันผลสุทธิหลังหักภาษี 15%/i)).toBeInTheDocument();
  });

  it('renders monthly income breakdown grid at end of investment horizon', () => {
    render(<DcaProjectionCalculator />);

    expect(screen.getByText(/💵 รายได้\/เดือน ณ สิ้นสุดการลงทุน/i)).toBeInTheDocument();
    expect(screen.getByText(/💰 ปันผล\/เดือน \(Monthly Dividend\)/i)).toBeInTheDocument();
    expect(screen.getByText(/📈 ราคา\/เดือน \(Monthly Growth\)/i)).toBeInTheDocument();
    expect(screen.getByText(/🎯 Total\/เดือน \(Total Monthly Return\)/i)).toBeInTheDocument();
  });

  it('renders growth trajectory SVG chart with legend and SVG path elements', () => {
    const { container } = render(<DcaProjectionCalculator />);

    expect(screen.getByText(/📈 Portfolio Trajectory Chart/i)).toBeInTheDocument();
    expect(screen.getByText('Portfolio Value')).toBeInTheDocument();
    expect(screen.getByText('Invested Capital')).toBeInTheDocument();

    const svgElement = container.querySelector('svg');
    expect(svgElement).not.toBeNull();
    expect(container.querySelector('path[fill="url(#dcaAreaGrad)"]')).not.toBeNull();
  });

  it('renders yearly milestone cards with 3 monthly income sub-metrics', () => {
    render(<DcaProjectionCalculator />);

    expect(screen.getByText(/🏁 Yearly Milestone Cards/i)).toBeInTheDocument();
    expect(screen.getByText('Milestone Yr 1')).toBeInTheDocument();
    expect(screen.getByText('Milestone Yr 5')).toBeInTheDocument();
    expect(screen.getByText('Milestone Yr 10')).toBeInTheDocument();

    expect(screen.getAllByText(/💰 ปันผล\/ด\./i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/📈 ราคา\/ด\./i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/🎯 Total\/ด\./i).length).toBeGreaterThan(0);
  });

  it('integrates calculateDcaProjectionApi backend calculation response', async () => {
    vi.spyOn(client, 'calculateDcaProjectionApi').mockResolvedValue({
      final_portfolio_value: 156000,
      multiplier: 3.25,
      total_invested: 48000,
      accumulated_dividend: 22000,
      capital_gain: 86000,
      total_return: 108000,
      tax_amount: 3882,
      final_monthly_dividend: 450,
      final_monthly_growth: 850,
      final_monthly_total: 1300,
      chart_data: [
        { year: 1, portfolio_value: 5000, total_invested: 4800 },
        { year: 10, portfolio_value: 156000, total_invested: 48000 },
      ],
      yearly_milestones: [
        { year: 1, portfolio_value: 5000, total_invested: 4800, monthly_dividend: 15, monthly_growth: 30, monthly_total: 45 },
        { year: 10, portfolio_value: 156000, total_invested: 48000, monthly_dividend: 450, monthly_growth: 850, monthly_total: 1300 },
      ],
    });

    render(<DcaProjectionCalculator />);

    await waitFor(() => {
      expect(screen.getByText(/เงินเพิ่มขึ้น 3.25x/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/\$156K/i)).toBeInTheDocument();
    expect(screen.getByText(/Net monthly dividend at year 10: \$450/i)).toBeInTheDocument();
  });

  it('pre-fills yield and growth from real market data once a ticker is entered', async () => {
    vi.spyOn(client, 'getMarketData').mockResolvedValue({
      JEPQ: { price: 58.5, dividend_yield_pct: 11.1, growth_rate_pct: 10, growth_rate_years_used: 5 },
    });

    render(<DcaProjectionCalculator />);
    fireEvent.change(screen.getByLabelText(/Ticker \(Optional Auto-fill\)/i), { target: { value: 'JEPQ' } });

    await waitFor(() => expect(screen.getByLabelText(/Dividend yield/i)).toHaveValue(11.1));
    expect(screen.getByLabelText(/Price growth/i)).toHaveValue(10);
  });

  it('leaves yield and growth blank and editable when market data cannot be fetched', async () => {
    vi.spyOn(client, 'getMarketData').mockRejectedValue(new Error('yfinance unavailable'));

    render(<DcaProjectionCalculator />);
    fireEvent.change(screen.getByLabelText(/Ticker \(Optional Auto-fill\)/i), { target: { value: 'BADTICKER' } });

    await waitFor(() => expect(client.getMarketData).toHaveBeenCalled());
    expect(screen.getByLabelText(/Dividend yield/i)).toHaveValue(null);

    fireEvent.change(screen.getByLabelText(/Dividend yield/i), { target: { value: '7' } });
    expect(screen.getByLabelText(/Dividend yield/i)).toHaveValue(7);
  });

  it('shows a "from Backend" badge on both fields once auto-filled from a real ticker fetch', async () => {
    vi.spyOn(client, 'getMarketData').mockResolvedValue({
      JEPQ: { price: 58.5, dividend_yield_pct: 11.1, growth_rate_pct: 10, growth_rate_years_used: 5 },
    });

    render(<DcaProjectionCalculator />);
    fireEvent.change(screen.getByLabelText(/Ticker \(Optional Auto-fill\)/i), { target: { value: 'JEPQ' } });

    await waitFor(() => expect(screen.getByLabelText(/Dividend yield/i)).toHaveValue(11.1));
    expect(screen.getAllByText('🔗 จาก Backend')).toHaveLength(2);
  });

  it('drops the "from Backend" badge on a field the moment the user edits it by hand, leaving the other field\'s badge alone', async () => {
    vi.spyOn(client, 'getMarketData').mockResolvedValue({
      JEPQ: { price: 58.5, dividend_yield_pct: 11.1, growth_rate_pct: 10, growth_rate_years_used: 5 },
    });

    render(<DcaProjectionCalculator />);
    fireEvent.change(screen.getByLabelText(/Ticker \(Optional Auto-fill\)/i), { target: { value: 'JEPQ' } });
    await waitFor(() => expect(screen.getAllByText('🔗 จาก Backend')).toHaveLength(2));

    fireEvent.change(screen.getByLabelText(/Dividend yield/i), { target: { value: '5' } });

    expect(screen.getAllByText('🔗 จาก Backend')).toHaveLength(1);
  });

  it('shows the "from Backend" badge when a ticker is picked from the Quick Pills too', async () => {
    vi.spyOn(client, 'getDcaAvailableTickers').mockResolvedValue([
      { symbol: 'SCHD', name: 'Schwab U.S. Dividend Equity ETF', default_yield: 3.3, default_growth: 8.0 },
    ]);

    render(<DcaProjectionCalculator />);
    await waitFor(() => expect(client.getDcaAvailableTickers).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /⚡ SCHD/i }));

    await waitFor(() => expect(screen.getByLabelText(/Dividend yield/i)).toHaveValue(3.3));
    expect(screen.getAllByText('🔗 จาก Backend')).toHaveLength(2);
  });

  it('never shows the "from Backend" badge for a value the user typed in without ever fetching', () => {
    render(<DcaProjectionCalculator />);

    fireEvent.change(screen.getByLabelText(/Dividend yield/i), { target: { value: '4' } });

    expect(screen.queryByText('🔗 จาก Backend')).not.toBeInTheDocument();
  });

  it('shows a short-history warning when the growth rate was computed over a recently-listed ticker\'s short history', async () => {
    vi.spyOn(client, 'getMarketData').mockResolvedValue({
      QQQI: { price: 55.16, dividend_yield_pct: 13.83, growth_rate_pct: 20.02, growth_rate_years_used: 2.51 },
    });

    render(<DcaProjectionCalculator />);
    fireEvent.change(screen.getByLabelText(/Ticker \(Optional Auto-fill\)/i), { target: { value: 'QQQI' } });

    await waitFor(() => expect(screen.getByLabelText(/Price growth/i)).toHaveValue(20.02));
    expect(screen.getByRole('alert')).toHaveTextContent('2.5');
  });

  it('shows no warning when the growth rate was computed over a full, long history', async () => {
    vi.spyOn(client, 'getMarketData').mockResolvedValue({
      KO: { price: 86.56, dividend_yield_pct: 2.4, growth_rate_pct: 12.19, growth_rate_years_used: 5.0 },
    });

    render(<DcaProjectionCalculator />);
    fireEvent.change(screen.getByLabelText(/Ticker \(Optional Auto-fill\)/i), { target: { value: 'KO' } });

    await waitFor(() => expect(screen.getByLabelText(/Price growth/i)).toHaveValue(12.19));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears the short-history warning the moment the user edits the growth field by hand', async () => {
    vi.spyOn(client, 'getMarketData').mockResolvedValue({
      QQQI: { price: 55.16, dividend_yield_pct: 13.83, growth_rate_pct: 20.02, growth_rate_years_used: 2.51 },
    });

    render(<DcaProjectionCalculator />);
    fireEvent.change(screen.getByLabelText(/Ticker \(Optional Auto-fill\)/i), { target: { value: 'QQQI' } });
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/Price growth/i), { target: { value: '8' } });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('displays THB symbol and hints when currency="THB" prop is passed', () => {
    render(<DcaProjectionCalculator currency="THB" fxRate={33.38} />);

    expect(screen.getByText(/Active Currency: THB \(฿\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Initial investment \(THB\)/i)).toBeInTheDocument();
  });

  it('renders a yearly breakdown table displaying 1-10 years with withheld tax', () => {
    render(<DcaProjectionCalculator currency="USD" />);

    expect(screen.getByText(/Yearly Breakdown \(1–10 Years\)/i)).toBeInTheDocument();
    expect(screen.getByText('Year 1')).toBeInTheDocument();
    expect(screen.getByText('Year 10')).toBeInTheDocument();
    expect(screen.getAllByText(/Withheld Tax \(15%\)/i).length).toBeGreaterThan(0);
  });
});

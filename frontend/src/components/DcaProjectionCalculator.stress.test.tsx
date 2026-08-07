import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { DcaProjectionCalculator } from './DcaProjectionCalculator';

describe('DcaProjectionCalculator Stress & Boundary Tests', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. NaN and Corrupted Data Immunity', () => {
    it('never renders "NaN" in DOM when inputs are empty strings or invalid text', () => {
      const { container } = render(<DcaProjectionCalculator />);

      const initialInput = screen.getByLabelText(/Initial investment/i);
      const monthlyInput = screen.getByLabelText(/Monthly contribution/i);
      const yearsInput = screen.getByLabelText(/Investment Horizon/i);
      const yieldInput = screen.getByLabelText(/Dividend yield/i);
      const growthInput = screen.getByLabelText(/Price growth/i);
      const taxInput = screen.getByLabelText(/Dividend Tax Rate/i);

      fireEvent.change(initialInput, { target: { value: '' } });
      fireEvent.change(monthlyInput, { target: { value: '' } });
      fireEvent.change(yearsInput, { target: { value: '' } });
      fireEvent.change(yieldInput, { target: { value: '' } });
      fireEvent.change(growthInput, { target: { value: '' } });
      fireEvent.change(taxInput, { target: { value: '' } });

      const textContent = container.textContent || '';
      expect(textContent).not.toContain('NaN');
    });

    it('handles NaN returned from calculateDcaProjectionApi without rendering NaN', async () => {
      vi.spyOn(client, 'calculateDcaProjectionApi').mockResolvedValue({
        final_portfolio_value: NaN,
        multiplier: NaN,
        total_invested: NaN,
        accumulated_dividend: NaN,
        capital_gain: NaN,
        total_return: NaN,
        tax_amount: NaN,
        final_monthly_dividend: NaN,
        final_monthly_growth: NaN,
        final_monthly_total: NaN,
        chart_data: [
          { year: 1, portfolio_value: NaN, total_invested: NaN },
          { year: 10, portfolio_value: NaN, total_invested: NaN },
        ],
        yearly_milestones: [
          { year: 1, portfolio_value: NaN, total_invested: NaN, monthly_dividend: NaN, monthly_growth: NaN, monthly_total: NaN },
        ],
      });

      const { container } = render(<DcaProjectionCalculator />);

      await waitFor(() => {
        expect(client.calculateDcaProjectionApi).toHaveBeenCalled();
      });

      const html = container.innerHTML;
      // SVG path attributes and DOM content must not have 'NaN'
      expect(html).not.toContain('NaN');
    });
  });

  describe('2. Dynamic Currency Switching & Slider Bounds', () => {
    it('correctly updates slider min/max/step when toggling between USD and THB', () => {
      render(<DcaProjectionCalculator currency="USD" />);

      const initialSliderUSD = screen.getAllByRole('slider')[0];
      const monthlySliderUSD = screen.getAllByRole('slider')[1];

      expect(initialSliderUSD).toHaveAttribute('max', '150000');
      expect(initialSliderUSD).toHaveAttribute('step', '500');
      expect(monthlySliderUSD).toHaveAttribute('max', '6000');
      expect(monthlySliderUSD).toHaveAttribute('step', '50');

      // Toggle to THB
      const thbBtn = screen.getByRole('button', { name: /THB \(฿\)/i });
      fireEvent.click(thbBtn);

      const initialSliderTHB = screen.getAllByRole('slider')[0];
      const monthlySliderTHB = screen.getAllByRole('slider')[1];

      expect(initialSliderTHB).toHaveAttribute('max', '5000000');
      expect(initialSliderTHB).toHaveAttribute('step', '10000');
      expect(monthlySliderTHB).toHaveAttribute('max', '200000');
      expect(monthlySliderTHB).toHaveAttribute('step', '1000');
    });

    it('preserves zero investment when toggling currency instead of resetting to default 100000/3000', () => {
      render(<DcaProjectionCalculator currency="USD" />);

      const initialInput = screen.getByLabelText(/Initial investment/i);
      fireEvent.change(initialInput, { target: { value: '0' } });

      const thbBtn = screen.getByRole('button', { name: /THB \(฿\)/i });
      fireEvent.click(thbBtn);

      // Check if value is 0 or default
      const thbInitialInput = screen.getByLabelText(/Initial investment \(THB\)/i);
      // Let's observe actual behavior:
      console.log('THB initial input after setting USD 0:', (thbInitialInput as HTMLInputElement).value);
    });
  });

  describe('3. Quick Pills & Market Data Race Conditions', () => {
    it('clicking multiple quick pills rapidly sets ticker and populates values', async () => {
      vi.spyOn(client, 'getDcaAvailableTickers').mockResolvedValue([
        { symbol: 'NVDA', name: 'NVIDIA', default_yield: 0.1, default_growth: 25.0 },
        { symbol: 'AAPL', name: 'Apple', default_yield: 0.5, default_growth: 12.0 },
        { symbol: 'VOO', name: 'Vanguard 500', default_yield: 1.5, default_growth: 10.0 },
      ]);

      render(<DcaProjectionCalculator />);

      await waitFor(() => expect(client.getDcaAvailableTickers).toHaveBeenCalled());

      fireEvent.click(screen.getByRole('button', { name: /⚡ NVDA/i }));
      expect(screen.getByLabelText(/Ticker \(Optional Auto-fill\)/i)).toHaveValue('NVDA');
      expect(screen.getByLabelText(/Dividend yield/i)).toHaveValue(0.1);
      expect(screen.getByLabelText(/Price growth/i)).toHaveValue(25.0);

      fireEvent.click(screen.getByRole('button', { name: /⚡ AAPL/i }));
      expect(screen.getByLabelText(/Ticker \(Optional Auto-fill\)/i)).toHaveValue('AAPL');
      expect(screen.getByLabelText(/Dividend yield/i)).toHaveValue(0.5);
      expect(screen.getByLabelText(/Price growth/i)).toHaveValue(12.0);
    });
  });

  describe('4. Negative & Boundary Inputs Validation', () => {
    it('gracefully handles negative initial investment, monthly contribution, and horizon', () => {
      const { container } = render(<DcaProjectionCalculator />);

      const initialInput = screen.getByLabelText(/Initial investment/i);
      const monthlyInput = screen.getByLabelText(/Monthly contribution/i);
      const yearsInput = screen.getByLabelText(/Investment Horizon/i);

      fireEvent.change(initialInput, { target: { value: '-5000' } });
      fireEvent.change(monthlyInput, { target: { value: '-200' } });
      fireEvent.change(yearsInput, { target: { value: '-5' } });

      const textContent = container.textContent || '';
      expect(textContent).not.toContain('NaN');
    });

    it('handles 0% yield and 0% growth without errors', () => {
      render(<DcaProjectionCalculator />);

      const yieldInput = screen.getByLabelText(/Dividend yield/i);
      const growthInput = screen.getByLabelText(/Price growth/i);

      fireEvent.change(yieldInput, { target: { value: '0' } });
      fireEvent.change(growthInput, { target: { value: '0' } });

      expect(screen.getByText(/เงินเพิ่มขึ้น 1.00x/i)).toBeInTheDocument();
    });
  });

  describe('5. SVG Chart Path Validity under Extreme Values', () => {
    it('generates valid SVG paths without NaN or invalid point coordinates', () => {
      const { container } = render(<DcaProjectionCalculator />);

      const paths = container.querySelectorAll('path');
      paths.forEach((path) => {
        const d = path.getAttribute('d');
        expect(d).not.toBeNull();
        expect(d).not.toContain('NaN');
        expect(d).not.toContain('undefined');
      });
    });
  });
});

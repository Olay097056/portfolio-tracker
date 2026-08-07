// frontend/src/components/TradingViewWidget.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TradingViewWidget } from './TradingViewWidget';

describe('TradingViewWidget', () => {
  it('shows a prompt instead of an empty box when no symbol is selected', () => {
    render(<TradingViewWidget symbol={null} />);
    expect(screen.getByText('เลือกหุ้นเพื่อดูกราฟ TradingView')).toBeInTheDocument();
    expect(screen.queryByTestId('tradingview-widget-container')).not.toBeInTheDocument();
  });

  it('injects the official TradingView embed script with the selected symbol', () => {
    render(<TradingViewWidget symbol="NVDA" />);
    const container = screen.getByTestId('tradingview-widget-container');
    const script = container.querySelector('script');
    expect(script).not.toBeNull();
    expect(script!.src).toBe('https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js');

    const config = JSON.parse(script!.text);
    expect(config.symbol).toBe('NVDA');
    expect(config.theme).toBe('dark');
    expect(config.allow_symbol_change).toBe(true);
  });

  it('rebuilds the widget with the new symbol when the symbol prop changes', () => {
    const { rerender } = render(<TradingViewWidget symbol="NVDA" />);
    let script = screen.getByTestId('tradingview-widget-container').querySelector('script');
    expect(JSON.parse(script!.text).symbol).toBe('NVDA');

    rerender(<TradingViewWidget symbol="AAPL" />);
    script = screen.getByTestId('tradingview-widget-container').querySelector('script');
    expect(JSON.parse(script!.text).symbol).toBe('AAPL');
  });

  it('never touches TradingView credentials — no password/login fields rendered', () => {
    render(<TradingViewWidget symbol="NVDA" />);
    expect(screen.queryByRole('textbox', { name: /password|username|email/i })).not.toBeInTheDocument();
  });
});

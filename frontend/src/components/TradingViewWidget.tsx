// frontend/src/components/TradingViewWidget.tsx
import { useEffect, useRef } from 'react';

interface TradingViewWidgetProps {
  symbol: string | null;
  height?: number;
}

// Embeds TradingView's own official "Advanced Real-Time Chart" widget
// (https://www.tradingview.com/widget/advanced-chart/) — a sealed iframe TradingView
// serves and controls. It cannot be fed this app's own OHLCV data, and this app's zone
// lines/overlays cannot be drawn on top of it; that would require TradingView's
// separately-licensed Charting Library, not this free public embed. Users see their own
// saved indicators only if they log into TradingView themselves inside the embedded
// widget — this component never touches their TradingView credentials.
export function TradingViewWidget({ symbol, height = 700 }: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !symbol) return;

    container.innerHTML = '';

    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    widgetDiv.style.height = '100%';
    widgetDiv.style.width = '100%';
    container.appendChild(widgetDiv);

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.text = JSON.stringify({
      autosize: true,
      symbol,
      interval: 'D',
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'th',
      allow_symbol_change: true,
      support_host: 'https://www.tradingview.com',
    });
    container.appendChild(script);

    return () => {
      container.innerHTML = '';
    };
  }, [symbol]);

  if (!symbol) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
        เลือกหุ้นเพื่อดูกราฟ TradingView
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container"
      data-testid="tradingview-widget-container"
      style={{ height, width: '100%' }}
    />
  );
}

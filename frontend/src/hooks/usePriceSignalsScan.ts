// frontend/src/hooks/usePriceSignalsScan.ts
import { useCallback, useState } from 'react';
import { getPriceSignal } from '../api/client';
import type { PriceSignalRow, ScanPeriod } from '../api/types';

interface ScanProgress {
  done: number;
  total: number;
}

export function usePriceSignalsScan() {
  const [results, setResults] = useState<Record<string, PriceSignalRow>>({});
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);

  const scan = useCallback(async (tickers: string[], period: ScanPeriod) => {
    setScanning(true);
    setProgress({ done: 0, total: tickers.length });
    const next: Record<string, PriceSignalRow> = {};

    for (let i = 0; i < tickers.length; i++) {
      const ticker = tickers[i];
      try {
        next[ticker] = await getPriceSignal(ticker, period);
      } catch {
        // One ticker's failure must not abandon the rest of the scan — record it as
        // unavailable and keep going, per the never-fabricate-a-value rule.
        next[ticker] = { ticker, percent_change_pct: null };
      }
      setProgress({ done: i + 1, total: tickers.length });
    }

    setResults(next);
    setScanning(false);
  }, []);

  return { results, scanning, progress, scan };
}

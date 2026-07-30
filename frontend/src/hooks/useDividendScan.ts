import { useCallback, useState } from 'react';
import { getDividendSignal } from '../api/client';
import type { DividendSignalRow } from '../api/types';

interface ScanProgress {
  done: number;
  total: number;
}

export function useDividendScan() {
  const [results, setResults] = useState<Record<string, DividendSignalRow>>({});
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);

  const scan = useCallback(async (tickers: string[]) => {
    setScanning(true);
    setProgress({ done: 0, total: tickers.length });
    const next: Record<string, DividendSignalRow> = {};

    for (let i = 0; i < tickers.length; i++) {
      const ticker = tickers[i];
      try {
        next[ticker] = await getDividendSignal(ticker);
      } catch {
        // One ticker's failure must not abandon the rest of the scan — record it as
        // unavailable and keep going, per the never-fabricate-a-value rule.
        next[ticker] = { ticker, price: null, gross_yield_pct: null, payment_frequency: null, dividend_growth_pct: null };
      }
      setProgress({ done: i + 1, total: tickers.length });
    }

    setResults(next);
    setScanning(false);
    setProgress(null);
  }, []);

  return { results, scanning, progress, scan };
}

export type DividendScanState = ReturnType<typeof useDividendScan>;

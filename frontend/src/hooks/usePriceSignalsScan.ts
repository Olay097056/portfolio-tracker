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
  const [scannedPeriod, setScannedPeriod] = useState<ScanPeriod | null>(null);
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
        next[ticker] = {
          ticker,
          percent_change_pct: null,
          rsi_14: null,
          volume_ratio: null,
          distance_from_sma50_pct: null,
        };
      }
      setProgress({ done: i + 1, total: tickers.length });
    }

    // Recorded alongside results, not read from the caller's own period state, so a column
    // heading built from this can never desync from the data actually being displayed —
    // even after the results survive a remount (e.g. switching Watchlist sub-tabs and back).
    setScannedPeriod(period);
    setResults(next);
    setScanning(false);
    setProgress(null);
  }, []);

  return { results, scannedPeriod, scanning, progress, scan };
}

export type PriceSignalsScanState = ReturnType<typeof usePriceSignalsScan>;

// frontend/src/hooks/usePriceSignalsScan.ts
import { useCallback, useRef, useState } from 'react';
import { getPriceSignal } from '../api/client';
import type { PriceSignalRow, ScanPeriod } from '../api/types';

interface ScanProgress {
  done: number;
  total: number;
}

const DEFAULT_PERIOD: ScanPeriod = '1w';

export function usePriceSignalsScan() {
  const [results, setResults] = useState<Record<string, PriceSignalRow>>({});
  const [scannedPeriod, setScannedPeriod] = useState<ScanPeriod | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const lastExplicitPeriod = useRef<ScanPeriod>(DEFAULT_PERIOD);

  const scan = useCallback(async (tickers: string[], period?: ScanPeriod) => {
    // A caller that doesn't care about percent_change_pct's period (Pre-Squeeze has no period
    // selector and never displays that field) can omit it — the last explicitly-requested period
    // keeps feeding percent_change_pct so results stay consistently labelled, but scannedPeriod
    // itself, and therefore Momentum's heading, is left untouched by a scan Momentum didn't ask
    // for. This is what stops a Pre-Squeeze scan from silently relabelling Momentum's column.
    const effectivePeriod = period ?? lastExplicitPeriod.current;

    setScanning(true);
    setProgress({ done: 0, total: tickers.length });
    const next: Record<string, PriceSignalRow> = {};

    for (let i = 0; i < tickers.length; i++) {
      const ticker = tickers[i];
      try {
        next[ticker] = await getPriceSignal(ticker, effectivePeriod);
      } catch {
        // One ticker's failure must not abandon the rest of the scan — record it as
        // unavailable and keep going, per the never-fabricate-a-value rule.
        next[ticker] = {
          ticker,
          percent_change_pct: null,
          rsi_14: null,
          volume_ratio: null,
          distance_from_sma50_pct: null,
          bb_width_pct: null,
          bb_width_percentile: null,
          atr_pct: null,
        };
      }
      setProgress({ done: i + 1, total: tickers.length });
    }

    if (period !== undefined) {
      lastExplicitPeriod.current = period;
      // Recorded alongside results, not read from the caller's own period state, so a column
      // heading built from this can never desync from the data actually being displayed — even
      // after the results survive a remount (e.g. switching Watchlist sub-tabs and back).
      setScannedPeriod(period);
    }
    setResults(next);
    setScanning(false);
    setProgress(null);
  }, []);

  return { results, scannedPeriod, scanning, progress, scan };
}

export type PriceSignalsScanState = ReturnType<typeof usePriceSignalsScan>;

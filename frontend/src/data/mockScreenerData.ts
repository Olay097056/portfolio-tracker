// frontend/src/data/mockScreenerData.ts

import { SCREENER_STOCKS, type ScreenerStock as BaseScreenerStock } from './screenerStocks';

export type MarketCapCategory = 'Large' | 'Mid' | 'Small';
export type ScreenerSector =
  | 'Technology'
  | 'Healthcare'
  | 'Finance'
  | 'Energy'
  | 'Consumer'
  | 'Real Estate'
  | string;

export interface ScreenerStock extends BaseScreenerStock {
  price: number;
  change1d: number;
  volumeRatio: number;
  rsi14: number;
  bbWidth: number;
  marketCapCategory: MarketCapCategory;
}

export const MOCK_SCREENER_STOCKS: ScreenerStock[] = SCREENER_STOCKS.map((s) => ({
  ...s,
  price: s.pe && s.eps ? +(s.pe * Math.abs(s.eps)).toFixed(2) : 150.0,
  change1d: s.upside ? +(s.upside / 4).toFixed(1) : 1.5,
  volumeRatio: 1.5,
  rsi14: s.rsi,
  bbWidth: 6.0,
  marketCapCategory: s.marketCap >= 10e9 ? 'Large' : s.marketCap >= 2e9 ? 'Mid' : 'Small',
}));

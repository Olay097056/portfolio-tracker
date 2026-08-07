// frontend/src/utils/screenerFilters.test.ts

import { describe, it, expect } from 'vitest';
import { SCREENER_STOCKS } from '../data/screenerStocks';
import { MOCK_SCREENER_STOCKS } from '../data/mockScreenerData';
import {
  DEFAULT_FILTERS,
  PRESET_STRATEGIES,
  filterStocks,
  sortStocks,
  paginateStocks,
  getActiveFilterCount,
} from './screenerFilters';

describe('screenerFilters utility', () => {
  it('returns all stocks when default filters are applied', () => {
    const result = filterStocks(SCREENER_STOCKS, DEFAULT_FILTERS);
    expect(result.length).toBe(SCREENER_STOCKS.length);
    expect(result.length).toBeGreaterThanOrEqual(50);
  });

  describe('10 Preset Strategies', () => {
    it('applies 🔥 หุ้น AI preset', () => {
      const filters = PRESET_STRATEGIES.ai.filters;
      const result = filterStocks(SCREENER_STOCKS, filters);
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((s) => s.symbol === 'NVDA')).toBe(true);
    });

    it('applies 🚀 หุ้นเติบโต preset', () => {
      const filters = PRESET_STRATEGIES.growth.filters;
      const result = filterStocks(SCREENER_STOCKS, filters);
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((s) => s.symbol === 'AMZN')).toBe(true);
    });

    it('applies 💎 หุ้นคุณค่า preset', () => {
      const filters = PRESET_STRATEGIES.value.filters;
      const result = filterStocks(SCREENER_STOCKS, filters);
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((s) => s.symbol === 'JPM')).toBe(true);
    });

    it('applies 💰 หุ้นปันผล preset', () => {
      const filters = PRESET_STRATEGIES.dividend.filters;
      const result = filterStocks(SCREENER_STOCKS, filters);
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((s) => s.symbol === 'O')).toBe(true);
    });

    it('applies 🏦 หุ้นการเงิน preset', () => {
      const filters = PRESET_STRATEGIES.finance.filters;
      const result = filterStocks(SCREENER_STOCKS, filters);
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((s) => s.symbol === 'BAC')).toBe(true);
    });

    it('applies 💻 Semiconductor preset', () => {
      const filters = PRESET_STRATEGIES.semiconductor.filters;
      const result = filterStocks(SCREENER_STOCKS, filters);
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((s) => s.symbol === 'AMD')).toBe(true);
    });

    it('applies ☁️ Cloud preset', () => {
      const filters = PRESET_STRATEGIES.cloud.filters;
      const result = filterStocks(SCREENER_STOCKS, filters);
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((s) => s.symbol === 'NOW')).toBe(true);
    });

    it('applies ⚡ Quantum preset', () => {
      const filters = PRESET_STRATEGIES.quantum.filters;
      const result = filterStocks(SCREENER_STOCKS, filters);
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((s) => s.symbol === 'IBM')).toBe(true);
    });

    it('applies 🤖 Robotics preset', () => {
      const filters = PRESET_STRATEGIES.robotics.filters;
      const result = filterStocks(SCREENER_STOCKS, filters);
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((s) => s.symbol === 'TSLA')).toBe(true);
    });

    it('applies 🛡️ Defense preset', () => {
      const filters = PRESET_STRATEGIES.defense.filters;
      const result = filterStocks(SCREENER_STOCKS, filters);
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((s) => s.symbol === 'PLTR')).toBe(true);
    });
  });

  describe('17 Range Bucket Filters', () => {
    it('filters by marketCap mega (> 200B)', () => {
      const res = filterStocks(SCREENER_STOCKS, { ...DEFAULT_FILTERS, marketCap: 'mega' });
      expect(res.every((s) => s.marketCap >= 200_000_000_000)).toBe(true);
    });

    it('filters by sector (Technology)', () => {
      const res = filterStocks(SCREENER_STOCKS, { ...DEFAULT_FILTERS, sector: 'Technology' });
      expect(res.every((s) => s.sector === 'Technology')).toBe(true);
    });

    it('filters by subSector (Semiconductors)', () => {
      const res = filterStocks(SCREENER_STOCKS, { ...DEFAULT_FILTERS, subSector: 'Semiconductors' });
      expect(res.every((s) => s.subSector === 'Semiconductors')).toBe(true);
    });

    it('filters by divYield (high >= 4%)', () => {
      const res = filterStocks(SCREENER_STOCKS, { ...DEFAULT_FILTERS, divYield: 'high' });
      expect(res.every((s) => s.divYield >= 4)).toBe(true);
    });

    it('filters by pe (under_15)', () => {
      const res = filterStocks(SCREENER_STOCKS, { ...DEFAULT_FILTERS, pe: 'under_15' });
      expect(res.every((s) => s.pe !== null && s.pe > 0 && s.pe < 15)).toBe(true);
    });

    it('filters by peg (under_1)', () => {
      const res = filterStocks(SCREENER_STOCKS, { ...DEFAULT_FILTERS, peg: 'under_1' });
      expect(res.every((s) => s.peg !== null && s.peg < 1)).toBe(true);
    });

    it('filters by ps (under_3)', () => {
      const res = filterStocks(SCREENER_STOCKS, { ...DEFAULT_FILTERS, ps: 'under_3' });
      expect(res.every((s) => s.ps !== null && s.ps < 3)).toBe(true);
    });

    it('filters by pb (under_1)', () => {
      const res = filterStocks(SCREENER_STOCKS, { ...DEFAULT_FILTERS, pb: 'under_1' });
      expect(res.every((s) => s.pb !== null && s.pb < 1)).toBe(true);
    });

    it('filters by evSales (under_5)', () => {
      const res = filterStocks(SCREENER_STOCKS, { ...DEFAULT_FILTERS, evSales: 'under_5' });
      expect(res.every((s) => s.evSales !== null && s.evSales < 5)).toBe(true);
    });

    it('filters by rsi (oversold < 35)', () => {
      const res = filterStocks(SCREENER_STOCKS, { ...DEFAULT_FILTERS, rsi: 'oversold' });
      expect(res.every((s) => s.rsi < 35)).toBe(true);
    });

    it('filters by roe (over_20)', () => {
      const res = filterStocks(SCREENER_STOCKS, { ...DEFAULT_FILTERS, roe: 'over_20' });
      expect(res.every((s) => s.roe !== null && s.roe > 20)).toBe(true);
    });

    it('filters by profitMargin (over_20)', () => {
      const res = filterStocks(SCREENER_STOCKS, { ...DEFAULT_FILTERS, profitMargin: 'over_20' });
      expect(res.every((s) => s.profitMargin !== null && s.profitMargin > 20)).toBe(true);
    });

    it('filters by eps (positive > 0)', () => {
      const res = filterStocks(SCREENER_STOCKS, { ...DEFAULT_FILTERS, eps: 'positive' });
      expect(res.every((s) => s.eps !== null && s.eps > 0)).toBe(true);
    });

    it('filters by de (under_1)', () => {
      const res = filterStocks(SCREENER_STOCKS, { ...DEFAULT_FILTERS, de: 'under_1' });
      expect(res.every((s) => s.de !== null && s.de < 1.0)).toBe(true);
    });

    it('filters by grossMargin (over_50)', () => {
      const res = filterStocks(SCREENER_STOCKS, { ...DEFAULT_FILTERS, grossMargin: 'over_50' });
      expect(res.every((s) => s.grossMargin !== null && s.grossMargin > 50)).toBe(true);
    });

    it('filters by pFcf (under_20)', () => {
      const res = filterStocks(SCREENER_STOCKS, { ...DEFAULT_FILTERS, pFcf: 'under_20' });
      expect(res.every((s) => s.pFcf !== null && s.pFcf < 20)).toBe(true);
    });

    it('filters by roic (over_15)', () => {
      const res = filterStocks(SCREENER_STOCKS, { ...DEFAULT_FILTERS, roic: 'over_15' });
      expect(res.every((s) => s.roic !== null && s.roic > 15)).toBe(true);
    });
  });

  describe('Search & Active Filter Count', () => {
    it('filters stocks by search query (symbol or company name)', () => {
      const resultBySymbol = filterStocks(SCREENER_STOCKS, { ...DEFAULT_FILTERS, searchQuery: 'nvda' });
      expect(resultBySymbol.some((s) => s.symbol === 'NVDA')).toBe(true);

      const resultByCompany = filterStocks(SCREENER_STOCKS, { ...DEFAULT_FILTERS, searchQuery: 'apple' });
      expect(resultByCompany.some((s) => s.symbol === 'AAPL')).toBe(true);
    });

    it('calculates active filter count correctly', () => {
      expect(getActiveFilterCount(DEFAULT_FILTERS)).toBe(0);
      const active = {
        ...DEFAULT_FILTERS,
        sector: 'Technology',
        pe: 'under_15',
        marketCap: 'mega',
      };
      expect(getActiveFilterCount(active)).toBe(3);
    });
  });

  describe('Sorting & Pagination', () => {
    it('sorts stocks by marketCap desc and asc', () => {
      const desc = sortStocks(SCREENER_STOCKS, 'marketCap', 'desc');
      expect(desc[0].marketCap).toBeGreaterThanOrEqual(desc[1].marketCap);

      const asc = sortStocks(SCREENER_STOCKS, 'marketCap', 'asc');
      expect(asc[0].marketCap).toBeLessThanOrEqual(asc[1].marketCap);
    });

    it('handles comparator symmetry when both values are null', () => {
      const stockA = { ...SCREENER_STOCKS[0], pe: null };
      const stockB = { ...SCREENER_STOCKS[1], pe: null };
      const sorted = sortStocks([stockA, stockB], 'pe', 'desc');
      expect(sorted.length).toBe(2);
    });

    it('filters out stocks with null or invalid rsi when rsi filter is active', () => {
      const stockWithNullRsi = { ...SCREENER_STOCKS[0], rsi: null as any };
      const res = filterStocks([stockWithNullRsi], { ...DEFAULT_FILTERS, rsi: 'oversold' });
      expect(res.length).toBe(0);
    });

    it('paginates 50+ stocks into 50 rows per page', () => {
      const paginatedPage1 = paginateStocks(SCREENER_STOCKS, 1, 50);
      expect(paginatedPage1.items.length).toBe(50);
      expect(paginatedPage1.currentPage).toBe(1);
      expect(paginatedPage1.totalPages).toBeGreaterThanOrEqual(2);
      expect(paginatedPage1.startItem).toBe(1);
      expect(paginatedPage1.endItem).toBe(50);

      const paginatedPage2 = paginateStocks(SCREENER_STOCKS, 2, 50);
      expect(paginatedPage2.items.length).toBe(SCREENER_STOCKS.length - 50);
      expect(paginatedPage2.currentPage).toBe(2);
      expect(paginatedPage2.startItem).toBe(51);
    });
  });

  describe('MOCK_SCREENER_STOCKS backward compatibility', () => {
    it('filters MOCK_SCREENER_STOCKS properly', () => {
      const res = filterStocks(MOCK_SCREENER_STOCKS, DEFAULT_FILTERS);
      expect(res.length).toBe(MOCK_SCREENER_STOCKS.length);
    });
  });
});

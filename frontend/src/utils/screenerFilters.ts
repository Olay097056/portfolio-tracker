// frontend/src/utils/screenerFilters.ts

import type { ScreenerStock } from '../data/screenerStocks';

export interface FilterState {
  marketCap: string;
  sector: string;
  subSector: string;
  divYield: string;
  pe: string;
  peg: string;
  ps: string;
  pb: string;
  evSales: string;
  rsi: string;
  roe: string;
  profitMargin: string;
  eps: string;
  de: string;
  grossMargin: string;
  pFcf: string;
  roic: string;
  searchQuery: string;
  presetTag?: string | null;

  // Optional legacy fields for backward compatibility
  rsiMin?: number | null;
  rsiMax?: number | null;
  volumeRatioMin?: number | null;
  priceChangeMin?: number | null;
  priceChangeMax?: number | null;
  bbWidthMin?: number | null;
  bbWidthMax?: number | null;
  peMin?: number | null;
  peMax?: number | null;
  divYieldMin?: number | null;
}

export const DEFAULT_FILTERS: FilterState = {
  marketCap: 'all',
  sector: 'all',
  subSector: 'all',
  divYield: 'all',
  pe: 'all',
  peg: 'all',
  ps: 'all',
  pb: 'all',
  evSales: 'all',
  rsi: 'all',
  roe: 'all',
  profitMargin: 'all',
  eps: 'all',
  de: 'all',
  grossMargin: 'all',
  pFcf: 'all',
  roic: 'all',
  searchQuery: '',
  presetTag: null,

  rsiMin: null,
  rsiMax: null,
  volumeRatioMin: null,
  priceChangeMin: null,
  priceChangeMax: null,
  bbWidthMin: null,
  bbWidthMax: null,
  peMin: null,
  peMax: null,
  divYieldMin: null,
};

export interface PresetStrategy {
  id: string;
  name: string;
  description: string;
  filters: FilterState;
}

export const PRESET_STRATEGIES: Record<string, PresetStrategy> = {
  ai: {
    id: 'ai',
    name: '🔥 หุ้น AI',
    description: 'หุ้นกลุ่มปัญญาประดิษฐ์ และ AI Infrastructure',
    filters: {
      ...DEFAULT_FILTERS,
      presetTag: 'AI',
    },
  },
  growth: {
    id: 'growth',
    name: '🚀 หุ้นเติบโต',
    description: 'หุ้นที่มีอัตราการเติบโตสูงและศักยภาพในอนาคต',
    filters: {
      ...DEFAULT_FILTERS,
      presetTag: 'Growth',
    },
  },
  value: {
    id: 'value',
    name: '💎 หุ้นคุณค่า',
    description: 'หุ้นราคาดี ปัจจัยพื้นฐานแข็งแกร่ง (P/E หรือ P/B ต่ำ)',
    filters: {
      ...DEFAULT_FILTERS,
      presetTag: 'Value',
    },
  },
  dividend: {
    id: 'dividend',
    name: '💰 หุ้นปันผล',
    description: 'หุ้นที่ให้ผลตอบแทนเงินปันผลสม่ำเสมอ',
    filters: {
      ...DEFAULT_FILTERS,
      presetTag: 'Dividend',
    },
  },
  finance: {
    id: 'finance',
    name: '🏦 หุ้นการเงิน',
    description: 'หุ้นกลุ่มธนาคารและสถาบันการเงินระดับโลก',
    filters: {
      ...DEFAULT_FILTERS,
      presetTag: 'Finance',
    },
  },
  semiconductor: {
    id: 'semiconductor',
    name: '💻 Semiconductor',
    description: 'หุ้นผู้ผลิตและออกแบบชิปเซมิคอนดักเตอร์',
    filters: {
      ...DEFAULT_FILTERS,
      presetTag: 'Semiconductor',
    },
  },
  cloud: {
    id: 'cloud',
    name: '☁️ Cloud',
    description: 'หุ้นผู้ให้บริการ Cloud Computing & SaaS',
    filters: {
      ...DEFAULT_FILTERS,
      presetTag: 'Cloud',
    },
  },
  quantum: {
    id: 'quantum',
    name: '⚡ Quantum',
    description: 'หุ้นผู้นำเทคโนโลยี Quantum Computing',
    filters: {
      ...DEFAULT_FILTERS,
      presetTag: 'Quantum',
    },
  },
  robotics: {
    id: 'robotics',
    name: '🤖 Robotics',
    description: 'หุ้นเทคโนโลยีหุ่นยนต์และระบบอัตโนมัติ',
    filters: {
      ...DEFAULT_FILTERS,
      presetTag: 'Robotics',
    },
  },
  defense: {
    id: 'defense',
    name: '🛡️ Defense',
    description: 'หุ้นกลุ่มความมั่นคงและเทคโนโลยีป้องกันประเทศ',
    filters: {
      ...DEFAULT_FILTERS,
      presetTag: 'Defense',
    },
  },
  // Legacy aliases for backward compatibility with tests
  momentum: {
    id: 'momentum',
    name: '🔥 Momentum Breakout',
    description: 'RSI > 55',
    filters: {
      ...DEFAULT_FILTERS,
      rsi: 'overbought',
      rsiMin: 55,
    },
  },
  oversold: {
    id: 'oversold',
    name: '🪃 Oversold Bounce',
    description: 'RSI < 35',
    filters: {
      ...DEFAULT_FILTERS,
      rsi: 'oversold',
      rsiMax: 35,
    },
  },
  high_dividend: {
    id: 'high_dividend',
    name: '💰 High Dividend',
    description: 'Div Yield > 3%',
    filters: {
      ...DEFAULT_FILTERS,
      divYield: 'high',
      divYieldMin: 3,
    },
  },
  pre_squeeze: {
    id: 'pre_squeeze',
    name: '💣 Pre-Squeeze',
    description: 'BB Width % < 5%',
    filters: {
      ...DEFAULT_FILTERS,
      bbWidthMax: 5,
    },
  },
};

export function getActiveFilterCount(filters: FilterState): number {
  let count = 0;
  const filterKeys: (keyof FilterState)[] = [
    'marketCap',
    'sector',
    'subSector',
    'divYield',
    'pe',
    'peg',
    'ps',
    'pb',
    'evSales',
    'rsi',
    'roe',
    'profitMargin',
    'eps',
    'de',
    'grossMargin',
    'pFcf',
    'roic',
  ];

  for (const key of filterKeys) {
    const val = filters[key];
    if (typeof val === 'string' && val !== 'all' && val !== 'All' && val !== '') {
      count++;
    }
  }
  return count;
}

export function filterStocks(stocks: ScreenerStock[], filters: FilterState): ScreenerStock[] {
  return stocks.filter((stock) => {
    // 1. Preset Tag
    if (filters.presetTag) {
      const tagLower = filters.presetTag.toLowerCase();
      const hasTag = stock.tags && stock.tags.some((t) => t.toLowerCase() === tagLower);
      const hasSector = stock.sector.toLowerCase().includes(tagLower);
      const hasSubSector = stock.subSector.toLowerCase().includes(tagLower);
      if (!hasTag && !hasSector && !hasSubSector) {
        return false;
      }
    }

    // 2. Market Cap
    if (filters.marketCap && filters.marketCap !== 'all' && filters.marketCap !== 'All') {
      const mc = stock.marketCap;
      const key = filters.marketCap.toLowerCase();
      if (key === 'mega' && mc < 200_000_000_000) return false;
      if (key === 'large' && (mc < 10_000_000_000 || mc >= 200_000_000_000)) return false;
      if (key === 'mid' && (mc < 2_000_000_000 || mc >= 10_000_000_000)) return false;
      if (key === 'small' && mc >= 2_000_000_000) return false;
    }

    // 3. Sector
    if (filters.sector && filters.sector !== 'all' && filters.sector !== 'All') {
      if (stock.sector !== filters.sector) return false;
    }

    // 4. SubSector
    if (filters.subSector && filters.subSector !== 'all' && filters.subSector !== 'All') {
      if (stock.subSector !== filters.subSector) return false;
    }

    // 5. Div Yield
    if (filters.divYield && filters.divYield !== 'all') {
      const dy = stock.divYield;
      if (filters.divYield === 'high' && dy < 4) return false;
      if (filters.divYield === 'moderate' && (dy < 2 || dy >= 4)) return false;
      if (filters.divYield === 'low' && (dy <= 0 || dy >= 2)) return false;
      if (filters.divYield === 'none' && dy !== 0) return false;
    }

    // 6. PE
    if (filters.pe && filters.pe !== 'all') {
      const pe = stock.pe;
      if (pe === null) return false;
      if (filters.pe === 'under_15' && (pe <= 0 || pe >= 15)) return false;
      if (filters.pe === '15_30' && (pe < 15 || pe > 30)) return false;
      if (filters.pe === '30_50' && (pe <= 30 || pe > 50)) return false;
      if (filters.pe === 'over_50' && pe <= 50) return false;
      if (filters.pe === 'negative' && pe >= 0) return false;
    }

    // 7. PEG
    if (filters.peg && filters.peg !== 'all') {
      const peg = stock.peg;
      if (peg === null) return false;
      if (filters.peg === 'under_1' && (peg <= 0 || peg >= 1)) return false;
      if (filters.peg === '1_2' && (peg < 1 || peg > 2)) return false;
      if (filters.peg === 'over_2' && peg <= 2) return false;
    }

    // 8. PS
    if (filters.ps && filters.ps !== 'all') {
      const ps = stock.ps;
      if (ps === null) return false;
      if (filters.ps === 'under_3' && ps >= 3) return false;
      if (filters.ps === '3_10' && (ps < 3 || ps > 10)) return false;
      if (filters.ps === 'over_10' && ps <= 10) return false;
    }

    // 9. PB
    if (filters.pb && filters.pb !== 'all') {
      const pb = stock.pb;
      if (pb === null) return false;
      if (filters.pb === 'under_1' && pb >= 1) return false;
      if (filters.pb === '1_3' && (pb < 1 || pb > 3)) return false;
      if (filters.pb === 'over_3' && pb <= 3) return false;
    }

    // 10. EV/Sales
    if (filters.evSales && filters.evSales !== 'all') {
      const ev = stock.evSales;
      if (ev === null) return false;
      if (filters.evSales === 'under_5' && ev >= 5) return false;
      if (filters.evSales === '5_15' && (ev < 5 || ev > 15)) return false;
      if (filters.evSales === 'over_15' && ev <= 15) return false;
    }

    // 11. RSI
    if (filters.rsi && filters.rsi !== 'all') {
      if (typeof stock.rsi !== 'number' || stock.rsi === null) return false;
      const rsi = (stock as any).rsi14 ?? stock.rsi;
      if (filters.rsi === 'oversold' && rsi >= 35) return false;
      if (filters.rsi === 'neutral' && (rsi < 35 || rsi > 65)) return false;
      if (filters.rsi === 'overbought' && rsi <= 65) return false;
    }

    // 12. ROE
    if (filters.roe && filters.roe !== 'all') {
      const roe = stock.roe;
      if (roe === null) return false;
      if (filters.roe === 'over_20' && roe <= 20) return false;
      if (filters.roe === '10_20' && (roe < 10 || roe > 20)) return false;
      if (filters.roe === 'under_10' && roe >= 10) return false;
    }

    // 13. Profit Margin
    if (filters.profitMargin && filters.profitMargin !== 'all') {
      const pm = stock.profitMargin;
      if (pm === null) return false;
      if (filters.profitMargin === 'over_20' && pm <= 20) return false;
      if (filters.profitMargin === '10_20' && (pm < 10 || pm > 20)) return false;
      if (filters.profitMargin === 'under_10' && pm >= 10) return false;
    }

    // 14. EPS
    if (filters.eps && filters.eps !== 'all') {
      const eps = stock.eps;
      if (eps === null) return false;
      if (filters.eps === 'positive' && eps <= 0) return false;
      if (filters.eps === 'over_5' && eps <= 5) return false;
      if (filters.eps === 'negative' && eps >= 0) return false;
    }

    // 15. D/E
    if (filters.de && filters.de !== 'all') {
      const de = stock.de;
      if (de === null) return false;
      if (filters.de === 'under_1' && de >= 1.0) return false;
      if (filters.de === '1_2' && (de < 1.0 || de > 2.0)) return false;
      if (filters.de === 'over_2' && de <= 2.0) return false;
    }

    // 16. Gross Margin
    if (filters.grossMargin && filters.grossMargin !== 'all') {
      const gm = stock.grossMargin;
      if (gm === null) return false;
      if (filters.grossMargin === 'over_50' && gm <= 50) return false;
      if (filters.grossMargin === '30_50' && (gm < 30 || gm > 50)) return false;
      if (filters.grossMargin === 'under_30' && gm >= 30) return false;
    }

    // 17. P/FCF
    if (filters.pFcf && filters.pFcf !== 'all') {
      const pfcf = stock.pFcf;
      if (pfcf === null) return false;
      if (filters.pFcf === 'under_20' && pfcf >= 20) return false;
      if (filters.pFcf === '20_40' && (pfcf < 20 || pfcf > 40)) return false;
      if (filters.pFcf === 'over_40' && pfcf <= 40) return false;
    }

    // 18. ROIC
    if (filters.roic && filters.roic !== 'all') {
      const roic = stock.roic;
      if (roic === null) return false;
      if (filters.roic === 'over_15' && roic <= 15) return false;
      if (filters.roic === '5_15' && (roic < 5 || roic > 15)) return false;
      if (filters.roic === 'under_5' && roic >= 5) return false;
    }

    // Legacy numeric filter options support
    const rsiVal = (stock as any).rsi14 ?? stock.rsi;
    if (filters.rsiMin !== undefined && filters.rsiMin !== null) {
      if (typeof stock.rsi !== 'number' || stock.rsi === null || rsiVal < filters.rsiMin) return false;
    }
    if (filters.rsiMax !== undefined && filters.rsiMax !== null) {
      if (typeof stock.rsi !== 'number' || stock.rsi === null || rsiVal > filters.rsiMax) return false;
    }
    if (filters.peMin !== undefined && filters.peMin !== null && (stock.pe === null || stock.pe < filters.peMin)) return false;
    if (filters.peMax !== undefined && filters.peMax !== null && (stock.pe === null || stock.pe > filters.peMax)) return false;
    if (filters.divYieldMin !== undefined && filters.divYieldMin !== null && stock.divYield < filters.divYieldMin) return false;

    // Search Query
    if (filters.searchQuery && filters.searchQuery.trim() !== '') {
      const q = filters.searchQuery.trim().toLowerCase();
      const matchSymbol = stock.symbol.toLowerCase().includes(q);
      const matchCompany = stock.company.toLowerCase().includes(q);
      if (!matchSymbol && !matchCompany) return false;
    }

    return true;
  });
}

export type ScreenerSortKey = keyof ScreenerStock | 'price' | 'change1d' | 'rsi14' | 'volumeRatio' | 'bbWidth';
export type ScreenerSortOrder = 'asc' | 'desc';

export function sortStocks(
  stocks: ScreenerStock[],
  key: ScreenerSortKey,
  order: ScreenerSortOrder = 'desc'
): ScreenerStock[] {
  return [...stocks].sort((a, b) => {
    const valA = (a as any)[key];
    const valB = (b as any)[key];

    if (valA === null && valB === null) return 0;
    if (valA === null) return 1;
    if (valB === null) return -1;
    if (valA === undefined && valB === undefined) return 0;
    if (valA === undefined) return 1;
    if (valB === undefined) return -1;

    if (typeof valA === 'string' && typeof valB === 'string') {
      return order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    if (typeof valA === 'number' && typeof valB === 'number') {
      return order === 'asc' ? valA - valB : valB - valA;
    }
    return 0;
  });
}

export function paginateStocks<T>(items: T[], page: number = 1, pageSize: number = 50) {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedItems = items.slice(startIndex, endIndex);

  return {
    items: paginatedItems,
    currentPage,
    totalPages,
    totalItems,
    startItem: totalItems === 0 ? 0 : startIndex + 1,
    endItem: endIndex,
  };
}

export function getSignalBadge(stock: ScreenerStock) {
  const rsi = (stock as any).rsi14 ?? stock.rsi;

  if (rsi > 70) {
    return { label: '🔴 Overbought', className: 'badge-red' };
  }
  if (rsi < 35) {
    return { label: '🪃 Oversold', className: 'badge-amber' };
  }
  if (stock.upside >= 20) {
    return { label: '🚀 High Upside', className: 'badge-emerald' };
  }
  if (stock.divYield >= 4) {
    return { label: '💰 High Div', className: 'badge-cyan' };
  }
  return null;
}

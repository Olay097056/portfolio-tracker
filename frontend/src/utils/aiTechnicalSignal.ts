// frontend/src/utils/aiTechnicalSignal.ts
import type { ChartPoint, Zone } from '../api/types';

export interface MacdMetrics {
  macdLine: number | null;
  signalLine: number | null;
  histogram: number | null;
  crossover: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  isBullishCrossover: boolean;
  isBearishCrossover: boolean;
}

export interface MovingAverageMetrics {
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  maCrossState: 'GOLDEN_CROSS' | 'DEATH_CROSS' | 'NEUTRAL';
  isBullishAlignment: boolean;
  distanceFromSma50Pct: number | null;
}

export interface TradingSetup {
  entryZone: { min: number; max: number; formatted: string };
  targetPrice: { price: number; upsidePct: number; formatted: string };
  stopLoss: { price: number; downsidePct: number; formatted: string };
  riskRewardRatio: { ratio: number; formatted: string };
}

export interface ConfidenceScoreBreakdown {
  score: number;
  ratingBadge: string;
  badgeColor: string;
  badgeBg: string;
  pillars: {
    rsiContribution: number;
    macdContribution: number;
    sma50DistanceContribution: number;
    volumeRatioContribution: number;
    bbWidthContribution: number;
    supportContribution: number;
    resistanceContribution: number;
  };
}

export interface AiSignalMetrics {
  rsi14: number | null;
  volumeRatio: number | null;
  distanceFromSma50Pct: number | null;
  bbWidthPct: number | null;
  isSqueeze: boolean;
  nearestSupport: { label: string; price: number; distancePct: number } | null;
  nearestResistance: { label: string; price: number; distancePct: number } | null;
  macd: MacdMetrics;
  movingAverages: MovingAverageMetrics;
  atr14: number | null;
  tradingSetup: TradingSetup;
  confidenceScore: ConfidenceScoreBreakdown;
  // Current price + ~1 week (5 trading days) ago, for the AI Analyst's trend lines. Derived
  // from the same already-fetched `points` history — never a new data source, so both are
  // null whenever there isn't enough history yet (never a guessed/interpolated value).
  currentPrice: number | null;
  rsi14Prev: number | null;
  pricePrev: number | null;
  // 52-week high/low and how far the current price sits from each — real "market context" that
  // needs no sector mapping, computed from the high/low of whatever's in `points`. This is only
  // a true 52-week window because DashboardPage.tsx currently fixes `range` at '1Y' (the range
  // selector UI is dormant behind SHOW_ZONE_EDITING_UI) -- if that's ever re-enabled with the
  // range selector visible again, a shorter/longer range would make this label inaccurate for
  // whatever range the user picked, and it would need to read the actual range back in.
  week52High: number | null;
  week52Low: number | null;
  distanceFrom52wHighPct: number | null;
  distanceFrom52wLowPct: number | null;
}

// ~1 week of weekday trading bars on a daily chart.
const PREV_TREND_OFFSET_TRADING_DAYS = 5;

export type AiSignalType = 'BULLISH' | 'BEARISH' | 'SQUEEZE' | 'NEUTRAL';

export interface AiSignalResult {
  ticker: string;
  type: AiSignalType;
  badgeLabel: string;
  badgeColor: string;
  badgeBg: string;
  confidenceScore: number;
  confidenceRating: string;
  narrative: string;
  tradingSetup: TradingSetup;
  metrics: AiSignalMetrics;
}

// Calculate RSI 14
export function calcRsi14(closes: number[]): number | null {
  if (!closes || closes.length < 15) return null;
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }
  const recent = changes.slice(-14);
  const gains = recent.filter((c) => c > 0);
  const losses = recent.filter((c) => c < 0).map((c) => -c);
  const avgGain = gains.reduce((a, b) => a + b, 0) / 14;
  const avgLoss = losses.reduce((a, b) => a + b, 0) / 14;

  if (avgGain === 0 && avgLoss === 0) return null;
  if (avgLoss === 0) return 100.0;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 100) / 100;
}

// Calculate Volume Ratio
export function calcVolumeRatio(volumes: number[]): number | null {
  if (!volumes || volumes.length < 21) return null;
  const latest = volumes[volumes.length - 1];
  const window = volumes.slice(-21, -1);
  const avg = window.reduce((a, b) => a + b, 0) / window.length;
  if (avg <= 0) return null;
  return Math.round((latest / avg) * 100) / 100;
}

// Calculate SMA 50 Distance %
export function calcSma50DistancePct(closes: number[]): number | null {
  if (!closes || closes.length < 5) return null;
  const period = Math.min(50, closes.length);
  const window = closes.slice(-period);
  const avg = window.reduce((a, b) => a + b, 0) / period;
  if (avg <= 0) return null;
  const latest = closes[closes.length - 1];
  return Math.round(((latest - avg) / avg) * 100 * 100) / 100;
}

// Calculate Bollinger Band Width %
export function calcBbWidthPct(closes: number[]): number | null {
  if (!closes || closes.length < 5) return null;
  const period = Math.min(20, closes.length);
  const window = closes.slice(-period);
  const mean = window.reduce((a, b) => a + b, 0) / period;
  if (mean <= 0) return null;
  const variance = window.reduce((acc, c) => acc + Math.pow(c - mean, 2), 0) / period;
  const std = Math.sqrt(variance);
  const upper = mean + 2 * std;
  const lower = mean - 2 * std;
  return Math.round(((upper - lower) / mean) * 100 * 100) / 100;
}

// Simple Moving Average
export function calcSma(closes: number[], period: number): number | null {
  if (!closes || closes.length < period || period <= 0) return null;
  const window = closes.slice(-period);
  const sum = window.reduce((a, b) => a + b, 0);
  return Math.round((sum / period) * 100) / 100;
}

// Moving Averages Metrics
export function calcMovingAverages(closes: number[]): MovingAverageMetrics {
  const sma20 = calcSma(closes, 20);
  const sma50 = calcSma(closes, 50);
  const sma200 = calcSma(closes, 200);
  const distanceFromSma50Pct = calcSma50DistancePct(closes);
  const latestClose = closes && closes.length > 0 ? closes[closes.length - 1] : null;

  let maCrossState: 'GOLDEN_CROSS' | 'DEATH_CROSS' | 'NEUTRAL' = 'NEUTRAL';
  let isBullishAlignment = false;

  if (sma20 !== null && sma50 !== null) {
    if (sma200 !== null) {
      if (sma20 > sma200 || sma50 > sma200) {
        maCrossState = 'GOLDEN_CROSS';
      } else if (sma20 < sma200 && sma50 < sma200) {
        maCrossState = 'DEATH_CROSS';
      }
      if (latestClose !== null && latestClose > sma20 && sma20 > sma50 && sma50 > sma200) {
        isBullishAlignment = true;
      }
    } else {
      if (sma20 > sma50) {
        maCrossState = 'GOLDEN_CROSS';
      } else if (sma20 < sma50) {
        maCrossState = 'DEATH_CROSS';
      }
      if (latestClose !== null && latestClose > sma20 && sma20 > sma50) {
        isBullishAlignment = true;
      }
    }
  }

  return {
    sma20,
    sma50,
    sma200,
    maCrossState,
    isBullishAlignment,
    distanceFromSma50Pct,
  };
}

// MACD (12, 26, 9)
export function calcMacd(closes: number[]): MacdMetrics {
  const defaultRes: MacdMetrics = {
    macdLine: null,
    signalLine: null,
    histogram: null,
    crossover: 'NEUTRAL',
    isBullishCrossover: false,
    isBearishCrossover: false,
  };

  if (!closes || closes.length < 26) return defaultRes;

  const k12 = 2 / (12 + 1);
  const ema12: number[] = [];
  let sum12 = 0;
  for (let i = 0; i < 12; i++) sum12 += closes[i];
  ema12[11] = sum12 / 12;
  for (let i = 12; i < closes.length; i++) {
    ema12[i] = closes[i] * k12 + ema12[i - 1] * (1 - k12);
  }

  const k26 = 2 / (26 + 1);
  const ema26: number[] = [];
  let sum26 = 0;
  for (let i = 0; i < 26; i++) sum26 += closes[i];
  ema26[25] = sum26 / 26;
  for (let i = 26; i < closes.length; i++) {
    ema26[i] = closes[i] * k26 + ema26[i - 1] * (1 - k26);
  }

  const macdSeries: { index: number; val: number }[] = [];
  for (let i = 25; i < closes.length; i++) {
    macdSeries.push({ index: i, val: ema12[i] - ema26[i] });
  }

  if (macdSeries.length === 0) return defaultRes;

  const latestMacd = macdSeries[macdSeries.length - 1].val;
  let latestSignal: number | null = null;
  const prevMacd: number | null = macdSeries.length > 1 ? macdSeries[macdSeries.length - 2].val : null;
  let prevSignal: number | null = null;

  if (macdSeries.length >= 9) {
    const k9 = 2 / (9 + 1);
    const signalArr: number[] = [];
    let sum9 = 0;
    for (let i = 0; i < 9; i++) sum9 += macdSeries[i].val;
    signalArr[8] = sum9 / 9;
    for (let i = 9; i < macdSeries.length; i++) {
      signalArr[i] = macdSeries[i].val * k9 + signalArr[i - 1] * (1 - k9);
    }
    latestSignal = signalArr[signalArr.length - 1];
    if (signalArr.length > 1) {
      prevSignal = signalArr[signalArr.length - 2];
    }
  }

  const roundedMacd = Math.round(latestMacd * 100) / 100;
  const roundedSignal = latestSignal !== null ? Math.round(latestSignal * 100) / 100 : null;
  const roundedHist = latestSignal !== null ? Math.round((latestMacd - latestSignal) * 100) / 100 : null;

  let isBullishCrossover = false;
  let isBearishCrossover = false;
  let crossover: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';

  if (latestSignal !== null && prevMacd !== null && prevSignal !== null) {
    if (latestMacd > latestSignal && prevMacd <= prevSignal) {
      isBullishCrossover = true;
    } else if (latestMacd < latestSignal && prevMacd >= prevSignal) {
      isBearishCrossover = true;
    }
  }

  if (isBullishCrossover || (roundedHist !== null && roundedHist > 0)) {
    crossover = 'BULLISH';
  } else if (isBearishCrossover || (roundedHist !== null && roundedHist < 0)) {
    crossover = 'BEARISH';
  }

  return {
    macdLine: roundedMacd,
    signalLine: roundedSignal,
    histogram: roundedHist,
    crossover,
    isBullishCrossover,
    isBearishCrossover,
  };
}

// ATR 14 calculation
export function calcAtr14(points: ChartPoint[]): number | null {
  if (!points || points.length < 2) return null;

  const trs: number[] = [];
  trs.push(points[0].high - points[0].low);

  for (let i = 1; i < points.length; i++) {
    const high = points[i].high;
    const low = points[i].low;
    const prevClose = points[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }

  const period = Math.min(14, trs.length);
  const recentTrs = trs.slice(-period);
  const avgTr = recentTrs.reduce((a, b) => a + b, 0) / period;
  return Math.round(avgTr * 100) / 100;
}

// Trading Setup Engine
export function calcTradingSetup(
  latestClose: number,
  atr14: number | null,
  nearestSupport: { price: number } | null,
  nearestResistance: { price: number } | null
): TradingSetup {
  if (!latestClose || latestClose <= 0 || isNaN(latestClose)) {
    return {
      entryZone: { min: 0, max: 0, formatted: '$0.00' },
      targetPrice: { price: 0, upsidePct: 0, formatted: '$0.00 (+0.0%)' },
      stopLoss: { price: 0, downsidePct: 0, formatted: '$0.00 (-0.0%)' },
      riskRewardRatio: { ratio: 1.0, formatted: '1 : 1.00' },
    };
  }

  const effectiveAtr = atr14 !== null && atr14 > 0 && !isNaN(atr14) ? atr14 : latestClose * 0.02;

  let rawSl = latestClose - 1.5 * effectiveAtr;
  if (nearestSupport && typeof nearestSupport.price === 'number' && !isNaN(nearestSupport.price) && nearestSupport.price < latestClose) {
    rawSl = Math.min(rawSl, nearestSupport.price * 0.99);
  }
  const slPrice = Math.max(0.01, Math.min(rawSl, Math.round(latestClose * 0.99 * 100) / 100));
  const downsidePct = Math.round(((latestClose - slPrice) / latestClose) * 100 * 100) / 100;

  let tpPrice = latestClose + 3.0 * effectiveAtr;
  if (nearestResistance && typeof nearestResistance.price === 'number' && !isNaN(nearestResistance.price) && nearestResistance.price > latestClose) {
    tpPrice = Math.max(tpPrice, nearestResistance.price);
  }
  tpPrice = Math.max(tpPrice, Math.round(latestClose * 1.02 * 100) / 100);
  const upsidePct = Math.round(((tpPrice - latestClose) / latestClose) * 100 * 100) / 100;

  let minEntry = Math.round(latestClose * 0.985 * 100) / 100;
  if (
    nearestSupport &&
    typeof nearestSupport.price === 'number' &&
    !isNaN(nearestSupport.price) &&
    nearestSupport.price < latestClose &&
    nearestSupport.price >= latestClose * 0.9
  ) {
    minEntry = Math.round(nearestSupport.price * 100) / 100;
  }
  const maxEntry = Math.round(latestClose * 100) / 100;
  if (minEntry > maxEntry) minEntry = maxEntry;

  const risk = latestClose - slPrice;
  const reward = tpPrice - latestClose;
  const ratio = risk > 0 ? Math.round((reward / risk) * 100) / 100 : 1.0;

  return {
    entryZone: {
      min: minEntry,
      max: maxEntry,
      formatted: `$${minEntry.toFixed(2)} - $${maxEntry.toFixed(2)}`,
    },
    targetPrice: {
      price: Math.round(tpPrice * 100) / 100,
      upsidePct,
      formatted: `$${tpPrice.toFixed(2)} (+${upsidePct.toFixed(1)}% Upside)`,
    },
    stopLoss: {
      price: Math.round(slPrice * 100) / 100,
      downsidePct,
      formatted: `$${slPrice.toFixed(2)} (-${downsidePct.toFixed(1)}% Downside)`,
    },
    riskRewardRatio: {
      ratio,
      formatted: `1 : ${ratio.toFixed(2)}`,
    },
  };
}

// AI Confidence Score Engine
// AI Confidence Score Engine (Fitted Logistic Regression Model)
// Note: squeeze status was in the old rule-based scorer's inputs but is not
// one of the backtest-fitted model's features (see model_fit_report.md) —
// not accepted here so a caller can't assume it influences the score.
export function calcConfidenceScore(
  ma: MovingAverageMetrics,
  rsi14: number | null,
  macd: MacdMetrics,
  volumeRatio: number | null,
  nearestSupport: { distancePct: number } | null,
  nearestResistance: { distancePct: number } | null,
  bbWidthPct?: number | null
): ConfidenceScoreBreakdown {
  const f_rsi14 = rsi14 !== null ? rsi14 : 50.0;
  const f_macd_hist = macd && macd.histogram !== null ? macd.histogram : 0.0;
  const f_dist_sma50 = ma && ma.distanceFromSma50Pct !== null ? ma.distanceFromSma50Pct : 0.0;
  const f_vol_ratio = volumeRatio !== null ? volumeRatio : 1.0;
  const f_bb_width = bbWidthPct !== null && bbWidthPct !== undefined ? bbWidthPct : 20.0;

  const hasSupport = nearestSupport !== null;
  const f_has_support = hasSupport ? 1.0 : 0.0;
  const f_supp_dist = hasSupport ? nearestSupport.distancePct : 0.0;

  const hasResistance = nearestResistance !== null;
  const f_has_resistance = hasResistance ? 1.0 : 0.0;
  const f_res_dist = hasResistance ? nearestResistance.distancePct : 0.0;

  const INTERCEPT = 0.554986;

  const rsiContribution = 0.003984 * f_rsi14;
  const macdContribution = -0.004069 * f_macd_hist;
  const sma50DistanceContribution = -0.010360 * f_dist_sma50;
  const volumeRatioContribution = -0.012616 * f_vol_ratio;
  const bbWidthContribution = -0.033333 * f_bb_width;
  const supportContribution = -0.377543 * f_has_support + -0.146947 * f_supp_dist;
  const resistanceContribution = -0.409538 * f_has_resistance + -0.045449 * f_res_dist;

  const logit =
    INTERCEPT +
    rsiContribution +
    macdContribution +
    sma50DistanceContribution +
    volumeRatioContribution +
    bbWidthContribution +
    supportContribution +
    resistanceContribution;

  const probability = 1 / (1 + Math.exp(-logit));
  const score = Math.min(100, Math.max(0, Math.round(probability * 100)));

  let ratingBadge = `🟢 ${score}% — BULLISH SETUP`;
  let badgeColor = '#34d399';
  let badgeBg = 'rgba(52, 211, 153, 0.15)';

  if (score >= 70) {
    ratingBadge = `🟢 ${score}% — STRONG CONVICTION`;
    badgeColor = '#10b981';
    badgeBg = 'rgba(16, 185, 129, 0.15)';
  } else if (score >= 60) {
    ratingBadge = `🟢 ${score}% — BULLISH SETUP`;
    badgeColor = '#34d399';
    badgeBg = 'rgba(52, 211, 153, 0.15)';
  } else if (score >= 50) {
    ratingBadge = `🟡 ${score}% — NEUTRAL / ACCUMULATION`;
    badgeColor = '#f59e0b';
    badgeBg = 'rgba(245, 158, 11, 0.15)';
  } else if (score >= 40) {
    ratingBadge = `🟠 ${score}% — WEAK / CAUTION`;
    badgeColor = '#f97316';
    badgeBg = 'rgba(249, 115, 22, 0.15)';
  } else {
    ratingBadge = `🔴 ${score}% — BEARISH RISK`;
    badgeColor = '#f43f5e';
    badgeBg = 'rgba(244, 63, 94, 0.15)';
  }

  return {
    score,
    ratingBadge,
    badgeColor,
    badgeBg,
    pillars: {
      rsiContribution: Math.round(rsiContribution * 10000) / 10000,
      macdContribution: Math.round(macdContribution * 10000) / 10000,
      sma50DistanceContribution: Math.round(sma50DistanceContribution * 10000) / 10000,
      volumeRatioContribution: Math.round(volumeRatioContribution * 10000) / 10000,
      bbWidthContribution: Math.round(bbWidthContribution * 10000) / 10000,
      supportContribution: Math.round(supportContribution * 10000) / 10000,
      resistanceContribution: Math.round(resistanceContribution * 10000) / 10000,
    },
  };
}

// Generate Thai Narrative
export function generateThaiNarrative(
  symbol: string,
  score: number,
  ma: MovingAverageMetrics,
  macd: MacdMetrics,
  rsi14: number | null,
  volumeRatio: number | null,
  isSqueeze: boolean,
  tradingSetup: TradingSetup
): string {
  const parts: string[] = [];

  parts.push(`${symbol} — ความเชื่อมั่น ${score}%`);

  if (ma.isBullishAlignment) {
    parts.push('ทรงราคาเรียงตัวเป็นแนวโน้มขาขึ้นแข็งแกร่ง (Bullish Alignment: Price > SMA20 > SMA50)');
  } else if (ma.maCrossState === 'GOLDEN_CROSS') {
    parts.push('เกิดสัญญาณ Golden Cross บ่งชี้โมเมนตัมขาขึ้นระยะยาว');
  } else if (ma.maCrossState === 'DEATH_CROSS') {
    parts.push('เกิดสัญญาณ Death Cross ชะลอตัว');
  } else if (ma.distanceFromSma50Pct !== null && ma.distanceFromSma50Pct > 0) {
    parts.push(`ราคายังคงยืนเหนือเส้น SMA 50 (+${ma.distanceFromSma50Pct.toFixed(1)}% relative)`);
  } else if (ma.distanceFromSma50Pct !== null) {
    parts.push(`ราคาต่ำกว่าเส้น SMA 50 (${ma.distanceFromSma50Pct.toFixed(1)}% relative)`);
  }

  if (macd.isBullishCrossover) {
    parts.push('MACD ตัดขึ้น Signal Line เกิดสัญญาณซื้อ (Bullish Crossover)');
  } else if (macd.macdLine !== null && macd.signalLine !== null && macd.macdLine > macd.signalLine) {
    parts.push('MACD อยู่เหนือ Signal Line รักษามุมมองบวก');
  } else if (macd.isBearishCrossover) {
    parts.push('MACD ตัดลง Signal Line เตือนแรงขายสะสม');
  }

  if (rsi14 !== null) {
    if (rsi14 < 30) {
      parts.push(`RSI (${rsi14.toFixed(1)} Oversold) มีโอกาสดีดตัว`);
    } else if (rsi14 > 70) {
      parts.push(`RSI (${rsi14.toFixed(1)} Overbought) ระวังย่อตัว`);
    } else if (rsi14 >= 50) {
      parts.push(`RSI (${rsi14.toFixed(1)} Neutral-Bullish) รักษาระดับทรงตัวแข็งแกร่ง`);
    }
  }

  if (volumeRatio !== null && volumeRatio >= 1.4) {
    parts.push(`วอลุ่มเข้าหนาแน่น (${volumeRatio.toFixed(1)}x เท่า)`);
  }

  if (isSqueeze) {
    parts.push('กรอบ Bollinger Band บีบตัวแน่น (Squeeze) สะสมพลังรอเบรกเอาท์');
  }

  parts.push(
    `วางแผนเทรด: เข้าซื้อโซน ${tradingSetup.entryZone.formatted} • เป้าหมาย TP ${tradingSetup.targetPrice.formatted} • ตัดขาดทุน SL ${tradingSetup.stopLoss.formatted} (R:R ratio ${tradingSetup.riskRewardRatio.formatted})`
  );

  return parts.join(' • ');
}

export function generateAiTechnicalSignal(
  ticker: string | null,
  points: ChartPoint[] | null,
  zones: Zone[]
): AiSignalResult {
  const symbol = ticker || 'STOCK';

  const emptySetup: TradingSetup = {
    entryZone: { min: 0, max: 0, formatted: '$0.00' },
    targetPrice: { price: 0, upsidePct: 0, formatted: '$0.00 (+0.0%)' },
    stopLoss: { price: 0, downsidePct: 0, formatted: '$0.00 (-0.0%)' },
    riskRewardRatio: { ratio: 1.0, formatted: '1 : 1.00' },
  };

  const emptyConfidence: ConfidenceScoreBreakdown = {
    score: 0,
    ratingBadge: '0% — NO DATA',
    badgeColor: '#94a3b8',
    badgeBg: 'rgba(148, 163, 184, 0.12)',
    pillars: {
      rsiContribution: 0,
      macdContribution: 0,
      sma50DistanceContribution: 0,
      volumeRatioContribution: 0,
      bbWidthContribution: 0,
      supportContribution: 0,
      resistanceContribution: 0,
    },
  };

  const emptyMacd: MacdMetrics = {
    macdLine: null,
    signalLine: null,
    histogram: null,
    crossover: 'NEUTRAL',
    isBullishCrossover: false,
    isBearishCrossover: false,
  };

  const emptyMa: MovingAverageMetrics = {
    sma20: null,
    sma50: null,
    sma200: null,
    maCrossState: 'NEUTRAL',
    isBullishAlignment: false,
    distanceFromSma50Pct: null,
  };

  if (!points || points.length === 0) {
    return {
      ticker: symbol,
      type: 'NEUTRAL',
      badgeLabel: '⚪ NO DATA',
      badgeColor: '#94a3b8',
      badgeBg: 'rgba(148, 163, 184, 0.12)',
      confidenceScore: 0,
      confidenceRating: '0% — NO DATA',
      narrative: `รอข้อมูลราคาเพื่อประมวลผลสัญญาณทางเทคนิคสำหรับ ${symbol}`,
      tradingSetup: emptySetup,
      metrics: {
        rsi14: null,
        volumeRatio: null,
        distanceFromSma50Pct: null,
        bbWidthPct: null,
        isSqueeze: false,
        nearestSupport: null,
        nearestResistance: null,
        macd: emptyMacd,
        movingAverages: emptyMa,
        atr14: null,
        tradingSetup: emptySetup,
        confidenceScore: emptyConfidence,
        currentPrice: null,
        rsi14Prev: null,
        pricePrev: null,
        week52High: null,
        week52Low: null,
        distanceFrom52wHighPct: null,
        distanceFrom52wLowPct: null,
      },
    };
  }

  const closes = points.map((p) => p.close);
  const volumes = points.map((p) => p.volume ?? 0);
  const latestClose = closes[closes.length - 1];

  const rsi14 = calcRsi14(closes);
  const volumeRatio = calcVolumeRatio(volumes);
  const distanceFromSma50Pct = calcSma50DistancePct(closes);
  const bbWidthPct = calcBbWidthPct(closes);
  const isSqueeze = bbWidthPct !== null && bbWidthPct < 12.0;

  // "~1 week ago" read of the same series, for the AI Analyst's trend lines. calcRsi14 already
  // returns null on too-short input, so a thin history naturally yields rsi14Prev: null here too
  // — no separate length check needed.
  const hasPrevWindow = closes.length > PREV_TREND_OFFSET_TRADING_DAYS;
  const rsi14Prev = hasPrevWindow ? calcRsi14(closes.slice(0, closes.length - PREV_TREND_OFFSET_TRADING_DAYS)) : null;
  const pricePrev = hasPrevWindow ? closes[closes.length - 1 - PREV_TREND_OFFSET_TRADING_DAYS] : null;

  // "52-week" high/low from the fetched range's own high/low bars -- real per-ticker data, no
  // sector mapping needed. See the AiSignalMetrics field comment for the range-fixed-at-1Y caveat.
  const week52High = points.length > 0 ? Math.max(...points.map((p) => p.high)) : null;
  const week52Low = points.length > 0 ? Math.min(...points.map((p) => p.low)) : null;
  const distanceFrom52wHighPct =
    week52High !== null && week52High > 0 && latestClose !== undefined && !isNaN(latestClose)
      ? Math.round(((week52High - latestClose) / week52High) * 100 * 100) / 100
      : null;
  const distanceFrom52wLowPct =
    week52Low !== null && week52Low > 0 && latestClose !== undefined && !isNaN(latestClose)
      ? Math.round(((latestClose - week52Low) / week52Low) * 100 * 100) / 100
      : null;

  const macd = calcMacd(closes);
  const movingAverages = calcMovingAverages(closes);
  const atr14 = calcAtr14(points);

  // Find nearest Support & Resistance
  const safeZones = zones || [];
  const supports = safeZones
    .filter((z) => z.kind === 'support' && z.price < latestClose)
    .sort((a, b) => b.price - a.price);

  const resistances = safeZones
    .filter((z) => z.kind === 'resistance' && z.price > latestClose)
    .sort((a, b) => a.price - b.price);

  const nearestSupport =
    supports.length > 0
      ? {
          label: `S1 (${supports[0].price.toFixed(2)})`,
          price: supports[0].price,
          distancePct:
            latestClose > 0 && !isNaN(latestClose)
              ? Math.round(((supports[0].price - latestClose) / latestClose) * 100 * 100) / 100
              : 0,
        }
      : null;

  const nearestResistance =
    resistances.length > 0
      ? {
          label: `R1 (${resistances[0].price.toFixed(2)})`,
          price: resistances[0].price,
          distancePct:
            latestClose > 0 && !isNaN(latestClose)
              ? Math.round(((resistances[0].price - latestClose) / latestClose) * 100 * 100) / 100
              : 0,
        }
      : null;

  const tradingSetup = calcTradingSetup(latestClose, atr14, nearestSupport, nearestResistance);
  const confidenceScore = calcConfidenceScore(
    movingAverages,
    rsi14,
    macd,
    volumeRatio,
    nearestSupport,
    nearestResistance,
    bbWidthPct
  );

  let type: AiSignalType = 'NEUTRAL';
  if (
    confidenceScore.score >= 60 ||
    movingAverages.isBullishAlignment ||
    macd.isBullishCrossover ||
    (distanceFromSma50Pct !== null && distanceFromSma50Pct > 2 && rsi14 !== null && rsi14 > 50)
  ) {
    type = 'BULLISH';
  } else if (confidenceScore.score < 40 || (rsi14 !== null && rsi14 > 70)) {
    type = 'BEARISH';
  } else if (isSqueeze) {
    type = 'SQUEEZE';
  }

  if (type === 'BULLISH' && confidenceScore.score < 70) {
    confidenceScore.ratingBadge = `🟢 ${confidenceScore.score}% — BULLISH SETUP`;
    confidenceScore.badgeColor = '#34d399';
    confidenceScore.badgeBg = 'rgba(52, 211, 153, 0.15)';
  } else if (type === 'BEARISH' && confidenceScore.score >= 40) {
    confidenceScore.ratingBadge = `🔴 ${confidenceScore.score}% — BEARISH RISK`;
    confidenceScore.badgeColor = '#f43f5e';
    confidenceScore.badgeBg = 'rgba(244, 63, 94, 0.15)';
  }

  const narrative = generateThaiNarrative(
    symbol,
    confidenceScore.score,
    movingAverages,
    macd,
    rsi14,
    volumeRatio,
    isSqueeze,
    tradingSetup
  );

  const metrics: AiSignalMetrics = {
    rsi14,
    volumeRatio,
    distanceFromSma50Pct,
    bbWidthPct,
    isSqueeze,
    nearestSupport,
    nearestResistance,
    macd,
    movingAverages,
    atr14,
    tradingSetup,
    confidenceScore,
    currentPrice: latestClose ?? null,
    rsi14Prev,
    pricePrev,
    week52High,
    week52Low,
    distanceFrom52wHighPct,
    distanceFrom52wLowPct,
  };

  return {
    ticker: symbol,
    type,
    badgeLabel: confidenceScore.ratingBadge,
    badgeColor: confidenceScore.badgeColor,
    badgeBg: confidenceScore.badgeBg,
    confidenceScore: confidenceScore.score,
    confidenceRating: confidenceScore.ratingBadge,
    narrative,
    tradingSetup,
    metrics,
  };
}


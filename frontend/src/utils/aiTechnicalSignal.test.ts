import { describe, expect, it } from 'vitest';
import {
  calcAtr14,
  calcBbWidthPct,
  calcConfidenceScore,
  calcMacd,
  calcMovingAverages,
  calcRsi14,
  calcSma,
  calcSma50DistancePct,
  calcTradingSetup,
  calcVolumeRatio,
  generateAiTechnicalSignal,
  generateThaiNarrative,
} from './aiTechnicalSignal';
import type { ChartPoint, Zone } from '../api/types';

describe('aiTechnicalSignal Utility', () => {
  it('calculates RSI 14 correctly or returns null for insufficient data', () => {
    expect(calcRsi14([])).toBeNull();
    expect(calcRsi14([10, 11, 12, 13, 14])).toBeNull();

    // 16 points of uptrend
    const prices = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
    const rsi = calcRsi14(prices);
    expect(rsi).toBe(100);
  });

  it('calculates volume ratio correctly', () => {
    expect(calcVolumeRatio([])).toBeNull();
    const vols = Array(20).fill(100);
    vols.push(200); // latest 200 vs 100 avg
    const ratio = calcVolumeRatio(vols);
    expect(ratio).toBe(2);
  });

  it('calculates SMA 50 distance % correctly', () => {
    const closes = Array(50).fill(100);
    closes[49] = 110; // +10% vs mean ~100.2
    const dist = calcSma50DistancePct(closes);
    expect(dist).toBeGreaterThan(9);
  });

  it('calculates Bollinger Band width % correctly', () => {
    const closes = Array(20).fill(100);
    const bb = calcBbWidthPct(closes);
    expect(bb).toBe(0); // zero variance
  });

  describe('SMA 20 / 50 / 200 calculations', () => {
    it('returns null when closes.length < period or period <= 0', () => {
      expect(calcSma([], 20)).toBeNull();
      expect(calcSma([10, 20, 30], 5)).toBeNull();
      expect(calcSma([10, 20, 30], 0)).toBeNull();
      expect(calcSma([10, 20, 30], -1)).toBeNull();
    });

    it('calculates simple moving average correctly for exact and longer lengths', () => {
      const closes = [10, 20, 30, 40, 50];
      expect(calcSma(closes, 5)).toBe(30);
      expect(calcSma(closes, 3)).toBe(40); // (30+40+50)/3
    });

    it('calcMovingAverages calculates sma20, sma50, sma200, cross state, and alignment', () => {
      // 200 points of steady uptrend
      const closes = Array.from({ length: 200 }, (_, i) => 100 + i);
      const ma = calcMovingAverages(closes);

      expect(ma.sma20).toBeDefined();
      expect(ma.sma50).toBeDefined();
      expect(ma.sma200).toBeDefined();
      expect(ma.sma20!).toBeGreaterThan(ma.sma50!);
      expect(ma.sma50!).toBeGreaterThan(ma.sma200!);
      expect(ma.maCrossState).toBe('GOLDEN_CROSS');
      expect(ma.isBullishAlignment).toBe(true);
    });

    it('calcMovingAverages detects DEATH_CROSS when short MAs drop below SMA200', () => {
      // 200 points of downtrend
      const closes = Array.from({ length: 200 }, (_, i) => 300 - i);
      const ma = calcMovingAverages(closes);

      expect(ma.maCrossState).toBe('DEATH_CROSS');
      expect(ma.isBullishAlignment).toBe(false);
    });

    it('handles short series (< 200 points) gracefully with fallback cross detection', () => {
      const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
      const ma = calcMovingAverages(closes);

      expect(ma.sma20).not.toBeNull();
      expect(ma.sma50).toBeNull();
      expect(ma.sma200).toBeNull();
      expect(ma.maCrossState).toBe('NEUTRAL');
    });
  });

  describe('MACD (12, 26, 9) Engine', () => {
    it('returns default null/neutral result when closes length < 26', () => {
      const macd = calcMacd([10, 12, 14, 16]);
      expect(macd.macdLine).toBeNull();
      expect(macd.signalLine).toBeNull();
      expect(macd.histogram).toBeNull();
      expect(macd.crossover).toBe('NEUTRAL');
      expect(macd.isBullishCrossover).toBe(false);
      expect(macd.isBearishCrossover).toBe(false);
    });

    it('calculates MACD values for sufficient price data (> 26 closes)', () => {
      const closes = Array.from({ length: 40 }, (_, i) => 100 + (i % 5) * 2 + i * 0.5);
      const macd = calcMacd(closes);

      expect(macd.macdLine).not.toBeNull();
      expect(macd.signalLine).not.toBeNull();
      expect(macd.histogram).not.toBeNull();
      expect(['BULLISH', 'BEARISH', 'NEUTRAL']).toContain(macd.crossover);
    });

    it('detects bullish and bearish crossovers correctly', () => {
      // Series where prices turn up sharply after a drop to trigger a bullish crossover
      const prices = [
        ...Array.from({ length: 30 }, () => 100),
        ...Array.from({ length: 15 }, (_, i) => 95 - i),
        ...Array.from({ length: 15 }, (_, i) => 80 + i * 4),
      ];
      const macd = calcMacd(prices);
      expect(macd.macdLine).toBeGreaterThan(macd.signalLine!);
      expect(macd.crossover).toBe('BULLISH');
    });
  });

  describe('ATR 14 Volatility Engine', () => {
    it('returns null for insufficient points (< 2 points)', () => {
      expect(calcAtr14([])).toBeNull();
      expect(calcAtr14([{ time: '2026-01-01', open: 100, high: 105, low: 95, close: 100, volume: 1000 }])).toBeNull();
    });

    it('calculates Average True Range over True Range series', () => {
      const points: ChartPoint[] = Array.from({ length: 20 }, (_, i) => ({
        time: `2026-01-${i + 1}`,
        open: 100 + i,
        high: 105 + i,
        low: 95 + i,
        close: 102 + i,
        volume: 1000,
      }));

      const atr = calcAtr14(points);
      expect(atr).not.toBeNull();
      expect(atr).toBeGreaterThan(0);
      expect(atr).toBeCloseTo(10, 0); // High - Low = 10 each day
    });
  });

  describe('Trading Setup Engine (Entry, TP, SL, R:R Math)', () => {
    it('calculates Entry Zone, TP, SL, and R:R ratio with support and resistance', () => {
      const latestClose = 100;
      const atr14 = 2.5;
      const support = { label: 'S1', price: 97, distancePct: -3.0 };
      const resistance = { label: 'R1', price: 112, distancePct: 12.0 };

      const setup = calcTradingSetup(latestClose, atr14, support, resistance);

      expect(setup.entryZone.min).toBeLessThanOrEqual(setup.entryZone.max);
      expect(setup.entryZone.max).toBe(100);
      expect(setup.targetPrice.price).toBeGreaterThanOrEqual(112);
      expect(setup.targetPrice.upsidePct).toBeGreaterThan(0);
      expect(setup.stopLoss.price).toBeLessThan(100);
      expect(setup.stopLoss.price).toBeGreaterThan(0);
      expect(setup.stopLoss.downsidePct).toBeGreaterThan(0);
      expect(setup.riskRewardRatio.ratio).toBeGreaterThan(0);
      expect(setup.riskRewardRatio.formatted).toContain('1 :');
    });

    it('clamps Stop Loss strictly above 0 even during extreme volatility', () => {
      const latestClose = 10;
      const atr14 = 50; // Extremely high ATR relative to close
      const setup = calcTradingSetup(latestClose, atr14, null, null);

      expect(setup.stopLoss.price).toBeGreaterThan(0);
      expect(setup.stopLoss.price).toBeLessThan(latestClose);
      expect(Number.isNaN(setup.stopLoss.price)).toBe(false);
      expect(Number.isNaN(setup.riskRewardRatio.ratio)).toBe(false);
    });

    it('handles null ATR and null S/R gracefully without throwing or NaN', () => {
      const setup = calcTradingSetup(150, null, null, null);

      expect(setup.entryZone.formatted).toBe('$147.75 - $150.00');
      expect(setup.targetPrice.price).toBeGreaterThan(150);
      expect(setup.stopLoss.price).toBeLessThan(150);
      expect(setup.stopLoss.price).toBeGreaterThan(0);
      expect(setup.riskRewardRatio.ratio).toBeGreaterThan(0);
    });

    it('returns safe default setup when latestClose <= 0, NaN, or invalid', () => {
      const setupZero = calcTradingSetup(0, 1.5, null, null);
      expect(setupZero).toEqual({
        entryZone: { min: 0, max: 0, formatted: '$0.00' },
        targetPrice: { price: 0, upsidePct: 0, formatted: '$0.00 (+0.0%)' },
        stopLoss: { price: 0, downsidePct: 0, formatted: '$0.00 (-0.0%)' },
        riskRewardRatio: { ratio: 1.0, formatted: '1 : 1.00' },
      });

      const setupNegative = calcTradingSetup(-50, 1.5, null, null);
      expect(setupNegative.entryZone.formatted).toBe('$0.00');
      expect(setupNegative.targetPrice.formatted).toBe('$0.00 (+0.0%)');

      const setupNan = calcTradingSetup(NaN, 1.5, null, null);
      expect(setupNan.entryZone.formatted).toBe('$0.00');
    });
  });

  describe('AI Confidence Score Engine (Fitted Logistic Regression)', () => {
    it('calculates confidence score between 0 and 100%', () => {
      const ma = calcMovingAverages(Array.from({ length: 200 }, (_, i) => 100 + i));
      const macd = calcMacd(Array.from({ length: 50 }, (_, i) => 100 + i));
      const scoreObj = calcConfidenceScore(ma, 60, macd, 2.0, { distancePct: -2 }, { distancePct: 10 });

      expect(scoreObj.score).toBeGreaterThanOrEqual(0);
      expect(scoreObj.score).toBeLessThanOrEqual(100);
      expect(scoreObj.ratingBadge).toBeDefined();
      expect(scoreObj.badgeColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(scoreObj.pillars).toBeDefined();
    });

    it('maps high score (>=70) to STRONG CONVICTION badge', () => {
      const ma = {
        sma20: 120,
        sma50: 110,
        sma200: 100,
        maCrossState: 'GOLDEN_CROSS' as const,
        isBullishAlignment: true,
        distanceFromSma50Pct: -20,
      };
      const macd = {
        macdLine: 5,
        signalLine: 2,
        histogram: -20,
        crossover: 'BULLISH' as const,
        isBullishCrossover: true,
        isBearishCrossover: false,
      };

      const scoreObj = calcConfidenceScore(ma, 80, macd, 0.5, null, null, 1.0);
      expect(scoreObj.score).toBeGreaterThanOrEqual(70);
      expect(scoreObj.ratingBadge).toContain('STRONG CONVICTION');
      expect(scoreObj.badgeColor).toBe('#10b981');
    });

    it('maps low score (<40) to BEARISH RISK badge', () => {
      const ma = {
        sma20: 80,
        sma50: 90,
        sma200: 100,
        maCrossState: 'DEATH_CROSS' as const,
        isBullishAlignment: false,
        distanceFromSma50Pct: 20,
      };
      const macd = {
        macdLine: -5,
        signalLine: -2,
        histogram: 0,
        crossover: 'BEARISH' as const,
        isBullishCrossover: false,
        isBearishCrossover: true,
      };

      const scoreObj = calcConfidenceScore(ma, 30, macd, 3.0, null, { distancePct: 1.0 }, 40.0);
      expect(scoreObj.score).toBeLessThan(40);
      expect(scoreObj.ratingBadge).toContain('BEARISH RISK');
      expect(scoreObj.badgeColor).toBe('#f43f5e');
    });
  });

  describe('Thai Narrative Text Generation', () => {
    it('generates rich Thai narrative incorporating ticker, score, indicators, and setup', () => {
      const ma = calcMovingAverages(Array.from({ length: 200 }, (_, i) => 100 + i));
      const macd = calcMacd(Array.from({ length: 50 }, (_, i) => 100 + i));
      const setup = calcTradingSetup(299, 5, { price: 290 }, { price: 320 });

      const text = generateThaiNarrative('AAPL', 85, ma, macd, 55, 1.6, true, setup);

      expect(text).toContain('AAPL');
      expect(text).toContain('ความเชื่อมั่น 85%');
      expect(text).toContain('วางแผนเทรด');
      expect(text).toContain('เข้าซื้อโซน');
      expect(text).toContain('เป้าหมาย TP');
      expect(text).toContain('ตัดขาดทุน SL');
    });
  });

  describe('generateAiTechnicalSignal Edge Cases', () => {
    it('returns empty fallback structure safely when points array is empty or null', () => {
      const resultNull = generateAiTechnicalSignal('TSLA', null, []);
      expect(resultNull.ticker).toBe('TSLA');
      expect(resultNull.confidenceScore).toBe(0);
      expect(resultNull.badgeLabel).toBe('⚪ NO DATA');
      expect(resultNull.confidenceRating).toBe('0% — NO DATA');
      expect(resultNull.metrics.macd.macdLine).toBeNull();
      expect(resultNull.tradingSetup.entryZone.formatted).toBe('$0.00');

      const resultEmpty = generateAiTechnicalSignal('TSLA', [], []);
      expect(resultEmpty.ticker).toBe('TSLA');
      expect(resultEmpty.confidenceScore).toBe(0);
      expect(resultEmpty.badgeLabel).toBe('⚪ NO DATA');
      expect(resultEmpty.metrics.macd.macdLine).toBeNull();
    });
  });

  it('generates dynamic AI signal result for chart points and zones', () => {
    const points = Array.from({ length: 30 }, (_, i) => ({
      time: `2026-01-${i + 1}`,
      open: 100 + i,
      high: 105 + i,
      low: 99 + i,
      close: 102 + i,
      volume: 1000 + i * 10,
    }));

    const zones: Zone[] = [
      { id: 1, kind: 'support' as const, price: 95, strength: null, source: 'manual' as const },
      { id: 2, kind: 'resistance' as const, price: 150, strength: null, source: 'manual' as const },
    ];

    const result = generateAiTechnicalSignal('NVDA', points, zones);
    expect(result.ticker).toBe('NVDA');
    expect(result.badgeLabel).toMatch(/STRONG CONVICTION|BULLISH/);
    expect(result.narrative).toContain('NVDA');
    expect(result.metrics.nearestSupport?.price).toBe(95);
    expect(result.metrics.nearestResistance?.price).toBe(150);
  });

  describe('currentPrice / rsi14Prev / pricePrev (AI Analyst trend lines)', () => {
    it('derives currentPrice and pricePrev (~5 trading days back) from the same points already fetched', () => {
      const points = Array.from({ length: 30 }, (_, i) => ({
        time: `2026-01-${i + 1}`,
        open: 100 + i,
        high: 105 + i,
        low: 99 + i,
        close: 102 + i,
        volume: 1000 + i * 10,
      }));

      const result = generateAiTechnicalSignal('NVDA', points, []);

      expect(result.metrics.currentPrice).toBe(131); // closes[29] = 102 + 29
      expect(result.metrics.pricePrev).toBe(126); // closes[24] = 102 + 24, 5 trading days back
      expect(result.metrics.rsi14Prev).not.toBeNull(); // 25 points is enough for calcRsi14
    });

    it('returns pricePrev/rsi14Prev as null (not fabricated) when there is not enough history for the offset', () => {
      const points = Array.from({ length: 4 }, (_, i) => ({
        time: `2026-01-${i + 1}`,
        open: 100 + i,
        high: 105 + i,
        low: 99 + i,
        close: 102 + i,
        volume: 1000,
      }));

      const result = generateAiTechnicalSignal('NVDA', points, []);

      expect(result.metrics.currentPrice).toBe(105); // still reports the current price
      expect(result.metrics.pricePrev).toBeNull();
      expect(result.metrics.rsi14Prev).toBeNull();
    });

    it('reports currentPrice/rsi14Prev/pricePrev as null in the empty-points fallback', () => {
      const result = generateAiTechnicalSignal('TSLA', [], []);
      expect(result.metrics.currentPrice).toBeNull();
      expect(result.metrics.rsi14Prev).toBeNull();
      expect(result.metrics.pricePrev).toBeNull();
    });
  });
});


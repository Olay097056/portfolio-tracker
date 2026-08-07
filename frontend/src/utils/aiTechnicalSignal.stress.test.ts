import { describe, expect, it } from 'vitest';
import {
  calcConfidenceScore,
  calcMacd,
  calcMovingAverages,
  calcTradingSetup,
  generateAiTechnicalSignal,
} from './aiTechnicalSignal';
import type { ChartPoint } from '../api/types';

describe('Empirical Math Engine Stress Tests for aiTechnicalSignal', () => {

  // Helper to check if any primitive value in an object tree is NaN
  function containsNaN(obj: any): boolean {
    if (obj === null || obj === undefined) return false;
    if (typeof obj === 'number') return Number.isNaN(obj);
    if (typeof obj === 'string') return obj.includes('NaN');
    if (typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        if (containsNaN(obj[key])) return true;
      }
    }
    return false;
  }

  describe('1. Edge Case: Empty and Extremely Short Series', () => {
    it('handles empty points array without NaN or errors', () => {
      const res = generateAiTechnicalSignal('TEST', [], []);
      expect(containsNaN(res)).toBe(false);
      expect(res.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(res.confidenceScore).toBeLessThanOrEqual(100);
      expect(res.tradingSetup.stopLoss.price).toBeGreaterThanOrEqual(0);
      expect(res.tradingSetup.riskRewardRatio.formatted).toMatch(/^1 : \d+\.\d{2}$/);
    });

    it('handles null points gracefully', () => {
      const res = generateAiTechnicalSignal('TEST', null, []);
      expect(containsNaN(res)).toBe(false);
      expect(res.confidenceScore).toBe(0);
    });

    it('handles 1-point series', () => {
      const points: ChartPoint[] = [
        { time: '2026-01-01', open: 100, high: 105, low: 95, close: 100, volume: 1000 }
      ];
      const res = generateAiTechnicalSignal('TEST', points, []);
      expect(containsNaN(res)).toBe(false);
      expect(res.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(res.confidenceScore).toBeLessThanOrEqual(100);
      expect(res.tradingSetup.stopLoss.price).toBeGreaterThanOrEqual(0);
    });

    it('handles series with 2 to 25 points (< 26 points for MACD)', () => {
      for (let len = 2; len < 26; len++) {
        const points: ChartPoint[] = Array.from({ length: len }, (_, i) => ({
          time: `2026-01-${i + 1}`,
          open: 100 + i,
          high: 105 + i,
          low: 95 + i,
          close: 100 + i,
          volume: 1000,
        }));
        const res = generateAiTechnicalSignal('TEST', points, []);
        expect(containsNaN(res)).toBe(false);
        expect(res.metrics.macd.macdLine).toBeNull();
        expect(res.metrics.macd.signalLine).toBeNull();
        expect(res.metrics.macd.crossover).toBe('NEUTRAL');
        expect(res.confidenceScore).toBeGreaterThanOrEqual(0);
        expect(res.confidenceScore).toBeLessThanOrEqual(100);
      }
    });

    it('handles series with 26 to 33 points (MACD line valid, signal line null)', () => {
      for (let len = 26; len <= 33; len++) {
        const points: ChartPoint[] = Array.from({ length: len }, (_, i) => ({
          time: `2026-01-${i + 1}`,
          open: 100 + i,
          high: 105 + i,
          low: 95 + i,
          close: 100 + i,
          volume: 1000,
        }));
        const res = generateAiTechnicalSignal('TEST', points, []);
        expect(containsNaN(res)).toBe(false);
        expect(res.metrics.macd.macdLine).not.toBeNull();
        expect(res.metrics.macd.signalLine).toBeNull();
        expect(res.metrics.macd.crossover).toBe('NEUTRAL');
      }
    });

    it('handles series with 34+ points (MACD and Signal line both computed)', () => {
      const points: ChartPoint[] = Array.from({ length: 34 }, (_, i) => ({
        time: `2026-01-${i + 1}`,
        open: 100 + i,
        high: 105 + i,
        low: 95 + i,
        close: 100 + i,
        volume: 1000,
      }));
      const res = generateAiTechnicalSignal('TEST', points, []);
      expect(containsNaN(res)).toBe(false);
      expect(res.metrics.macd.macdLine).not.toBeNull();
      expect(res.metrics.macd.signalLine).not.toBeNull();
      expect(res.metrics.macd.histogram).not.toBeNull();
    });
  });

  describe('2. Edge Case: Zero Price Variance (Constant Prices & Volumes)', () => {
    it('handles flat positive prices (e.g., all closes = 100, volume = 1000)', () => {
      const points: ChartPoint[] = Array.from({ length: 50 }, (_, i) => ({
        time: `2026-01-${i + 1}`,
        open: 100,
        high: 100,
        low: 100,
        close: 100,
        volume: 1000,
      }));

      const res = generateAiTechnicalSignal('FLAT', points, []);
      expect(containsNaN(res)).toBe(false);
      expect(res.metrics.rsi14).toBeNull(); // avgGain=0, avgLoss=0 => null
      expect(res.metrics.bbWidthPct).toBe(0); // variance = 0
      expect(res.metrics.macd.macdLine).toBe(0);
      expect(res.metrics.macd.signalLine).toBe(0);
      expect(res.metrics.macd.histogram).toBe(0);
      expect(res.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(res.confidenceScore).toBeLessThanOrEqual(100);
      expect(res.tradingSetup.stopLoss.price).toBeGreaterThan(0);
      expect(res.tradingSetup.riskRewardRatio.formatted).toMatch(/^1 : \d+\.\d{2}$/);
    });

    it('handles all zero prices and volumes without NaN or division by zero', () => {
      const points: ChartPoint[] = Array.from({ length: 30 }, (_, i) => ({
        time: `2026-01-${i + 1}`,
        open: 0,
        high: 0,
        low: 0,
        close: 0,
        volume: 0,
      }));

      const res = generateAiTechnicalSignal('ZERO', points, []);
      expect(containsNaN(res)).toBe(false);
      expect(res.tradingSetup.targetPrice.upsidePct).toBe(0);
      expect(res.tradingSetup.targetPrice.formatted).toBe('$0.00 (+0.0%)');
      expect(res.tradingSetup.stopLoss.downsidePct).toBe(0);
      expect(res.tradingSetup.stopLoss.formatted).toBe('$0.00 (-0.0%)');
      expect(res.tradingSetup.riskRewardRatio.ratio).toBe(1.0);
      expect(res.tradingSetup.riskRewardRatio.formatted).toBe('1 : 1.00');
    });
  });

  describe('3. Trading Setup & Stop Loss / R:R Boundary Tests', () => {
    it('never produces negative Stop Loss even for penny stocks or high ATR', () => {
      const lowPrices = [0.01, 0.05, 0.1, 1.0];
      for (const price of lowPrices) {
        const setup = calcTradingSetup(price, price * 5, null, null);
        expect(setup.stopLoss.price).toBeGreaterThan(0);
        expect(setup.stopLoss.price).toBeGreaterThanOrEqual(0.01);
        expect(containsNaN(setup)).toBe(false);
      }
    });

    it('formats R:R ratio properly with 2 decimal places', () => {
      const setup = calcTradingSetup(100, 2, null, null);
      expect(setup.riskRewardRatio.formatted).toMatch(/^1 : \d+\.\d{2}$/);
      expect(setup.riskRewardRatio.ratio).toBeGreaterThan(0);
      expect(containsNaN(setup)).toBe(false);
    });

    it('handles extreme price inputs (e.g. $1,000,000 per share)', () => {
      const setup = calcTradingSetup(1000000, 50000, null, null);
      expect(containsNaN(setup)).toBe(false);
      expect(setup.stopLoss.price).toBeGreaterThan(0);
      expect(setup.riskRewardRatio.ratio).toBeGreaterThan(0);
    });

    it('handles support price close to or above latest close correctly', () => {
      const supportBelow = { price: 95 };
      const resistanceAbove = { price: 120 };
      const setup = calcTradingSetup(100, 2, supportBelow, resistanceAbove);
      expect(setup.stopLoss.price).toBeLessThan(100);
      expect(setup.targetPrice.price).toBeGreaterThanOrEqual(120);
      expect(containsNaN(setup)).toBe(false);
    });
  });

  describe('4. AI Confidence Score Clamping & Pillar Contributions', () => {
    it('clamps confidence score between 0 and 100 under all pillar combinations', () => {
      const maStates = [
        calcMovingAverages([]),
        calcMovingAverages([10, 20]),
        calcMovingAverages(Array.from({ length: 200 }, (_, i) => 100 + i)),
        calcMovingAverages(Array.from({ length: 200 }, (_, i) => 200 - i)),
      ];

      const macdStates = [
        calcMacd([]),
        calcMacd(Array.from({ length: 30 }, () => 100)),
        calcMacd(Array.from({ length: 50 }, (_, i) => 100 + i)),
      ];

      const rsiValues = [null, 0, 25, 30, 45, 55, 75, 85, 100];
      const volumeRatios = [null, 0, 0.5, 1.0, 1.5, 2.0];
      const squeezeStates = [true, false];

      for (const ma of maStates) {
        for (const macd of macdStates) {
          for (const rsi of rsiValues) {
            for (const vr of volumeRatios) {
              for (const sq of squeezeStates) {
                const scoreObj = calcConfidenceScore(ma, rsi, macd, vr, sq, null, null);
                expect(scoreObj.score).toBeGreaterThanOrEqual(0);
                expect(scoreObj.score).toBeLessThanOrEqual(100);
                expect(containsNaN(scoreObj)).toBe(false);
                expect(typeof scoreObj.pillars.rsiContribution).toBe('number');
                expect(typeof scoreObj.pillars.macdContribution).toBe('number');
                expect(typeof scoreObj.pillars.sma50DistanceContribution).toBe('number');
                expect(typeof scoreObj.pillars.volumeRatioContribution).toBe('number');
                expect(typeof scoreObj.pillars.bbWidthContribution).toBe('number');
                expect(typeof scoreObj.pillars.supportContribution).toBe('number');
                expect(typeof scoreObj.pillars.resistanceContribution).toBe('number');
              }
            }
          }
        }
      }
    });
  });

  describe('5. MACD Crossover State Logic Stress Test', () => {
    it('correctly identifies bullish crossover on upward trend change', () => {
      const prices = [
        ...Array.from({ length: 30 }, () => 100),
        ...Array.from({ length: 15 }, (_, i) => 100 - i * 2), // dropping
        ...Array.from({ length: 15 }, (_, i) => 70 + i * 5),  // strong surge
      ];
      const macd = calcMacd(prices);
      expect(macd.macdLine).not.toBeNull();
      expect(macd.signalLine).not.toBeNull();
      expect(macd.crossover).toBe('BULLISH');
      expect(containsNaN(macd)).toBe(false);
    });

    it('correctly identifies bearish crossover on downward trend change', () => {
      const prices = [
        ...Array.from({ length: 30 }, () => 100),
        ...Array.from({ length: 15 }, (_, i) => 100 + i * 2), // surging
        ...Array.from({ length: 15 }, (_, i) => 130 - i * 5), // sharp selloff
      ];
      const macd = calcMacd(prices);
      expect(macd.macdLine).not.toBeNull();
      expect(macd.signalLine).not.toBeNull();
      expect(macd.crossover).toBe('BEARISH');
      expect(containsNaN(macd)).toBe(false);
    });
  });
});

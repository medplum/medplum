// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { calculate, formatNumber, getMResults, minLambda, poissonCdfFn } from './arrayColumnPaddingUtils';

describe('arrayColumnPaddingUtils', () => {
  describe('poissonCdfFn', () => {
    test('returns 1 for large k relative to lambda', () => {
      // P(X ≤ 100) for X ~ Poisson(1) should be essentially 1
      expect(poissonCdfFn(100, 1)).toBeCloseTo(1, 10);
    });

    test('returns correct value for k=0', () => {
      // P(X ≤ 0) = P(X = 0) = e^(-lambda)
      expect(poissonCdfFn(0, 1)).toBeCloseTo(Math.exp(-1), 10);
      expect(poissonCdfFn(0, 2)).toBeCloseTo(Math.exp(-2), 10);
      expect(poissonCdfFn(0, 5)).toBeCloseTo(Math.exp(-5), 10);
    });

    test('returns correct cumulative values', () => {
      // For lambda = 1, P(X ≤ 1) = e^(-1) + e^(-1)*1 = e^(-1) * 2
      const expected = Math.exp(-1) * 2;
      expect(poissonCdfFn(1, 1)).toBeCloseTo(expected, 10);
    });

    test('CDF is monotonically increasing in k', () => {
      const lambda = 5;
      let prev = 0;
      for (let k = 0; k <= 20; k++) {
        const current = poissonCdfFn(k, lambda);
        expect(current).toBeGreaterThanOrEqual(prev);
        prev = current;
      }
    });

    test('CDF is monotonically decreasing in lambda for fixed k', () => {
      const k = 5;
      let prev = 1;
      for (let lambda = 1; lambda <= 20; lambda++) {
        const current = poissonCdfFn(k, lambda);
        expect(current).toBeLessThanOrEqual(prev);
        prev = current;
      }
    });
  });

  describe('minLambda', () => {
    test('finds lambda where CDF equals target probability', () => {
      // For p = 0.5 and k = 5, find lambda such that P(X ≤ 5) ≈ 0.5
      const result = minLambda(0.5, 5);
      const cdf = poissonCdfFn(5, result);
      expect(cdf).toBeLessThanOrEqual(0.5);
      // The CDF at a slightly smaller lambda should be > p
      expect(poissonCdfFn(5, result - 0.001)).toBeGreaterThan(0.5);
    });

    test('returns higher lambda for smaller probability', () => {
      const lambda1 = minLambda(0.5, 10);
      const lambda2 = minLambda(0.1, 10);
      expect(lambda2).toBeGreaterThan(lambda1);
    });

    test('returns smaller lambda for smaller k', () => {
      // For smaller k, the CDF is lower at the same λ, so we need less λ to reach the target p
      const lambda1 = minLambda(0.5, 10);
      const lambda2 = minLambda(0.5, 5);
      expect(lambda2).toBeLessThan(lambda1);
    });
  });

  describe('formatNumber', () => {
    test('formats integers without decimals in auto mode', () => {
      expect(formatNumber(42)).toBe('42');
      expect(formatNumber(1000)).toBe('1000');
      expect(formatNumber(0)).toBe('0');
    });

    test('formats very small numbers in scientific notation in auto mode', () => {
      expect(formatNumber(0.00001)).toMatch(/e-/);
      expect(formatNumber(1e-10)).toMatch(/e-/);
    });

    test('formats regular decimals in auto mode', () => {
      const result = formatNumber(3.14159);
      expect(result).toContain('3.14159');
    });

    test('uses scientific notation when format is scientific', () => {
      expect(formatNumber(1234, 'scientific', 2)).toBe('1.23e+3');
      expect(formatNumber(0.001, 'scientific', 2)).toBe('1.00e-3');
    });

    test('uses fixed notation when format is fixed', () => {
      expect(formatNumber(3.14159, 'fixed', 2)).toBe('3.14');
      expect(formatNumber(1000, 'fixed', 2)).toBe('1000.00');
    });

    test('handles non-finite values', () => {
      expect(formatNumber(Infinity)).toBe('Infinity');
      expect(formatNumber(-Infinity)).toBe('-Infinity');
      expect(formatNumber(NaN)).toBe('NaN');
    });
  });

  describe('calculate', () => {
    test('calculates correct rowsSampled', () => {
      const result = calculate(1000, 3, 0.999999);
      expect(result.rowsSampled).toBe(300000);
    });

    test('calculates cutoff frequency based on PostgreSQL formula', () => {
      // cutoffFrequencyExact = (9 * elemsPerRow * rowsSampled) / ((statisticsTarget * 10 * 1000) / 7)
      // For statisticsTarget=1000, elemsPerRow=3:
      // rowsSampled = 300000
      // cutoffFrequencyExact = (9 * 3 * 300000) / ((1000 * 10 * 1000) / 7)
      // = 8100000 / 1428571.4... = 5.67
      const result = calculate(1000, 3, 0.999999);
      expect(result.cutoffFrequencyExact).toBeCloseTo(5.67, 1);
      expect(result.cutoffFrequency).toBe(6); // ceil(5.67)
    });

    test('minimumSelectivity is cutoffFrequency / rowsSampled', () => {
      const result = calculate(1000, 3, 0.999999);
      expect(result.minimumSelectivity).toBe(result.cutoffFrequency / result.rowsSampled);
    });

    test('uses selectivityOverride when provided and larger than minimum', () => {
      const result = calculate(1000, 3, 0.999999, 0.001);
      expect(result.targetSelectivity).toBe(0.001);
    });

    test('uses minimumSelectivity when selectivityOverride is smaller', () => {
      const result = calculate(1000, 3, 0.999999, 1e-10);
      expect(result.targetSelectivity).toBe(result.minimumSelectivity);
    });

    test('returns floor and ceiling results', () => {
      const result = calculate(1000, 3, 0.999999);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].name).toBe('Floor');
      expect(result.results[1].name).toBe('Ceiling');
      expect(result.results[1].result.m).toBe(result.results[0].result.m + 1);
    });
  });

  describe('getMResults', () => {
    test('calculates poissonCdf from confidence and m', () => {
      const result = getMResults(10, 0.999, 100, 100000);
      // poissonCdfValue = (1 - confidence)^(1/m) = 0.001^0.1
      const expectedPoissonCdf = Math.pow(0.001, 0.1);
      expect(result.poissonCdf).toBeCloseTo(expectedPoissonCdf, 10);
    });

    test('calculates selectivity f as lambda / rowsSampled', () => {
      const result = getMResults(10, 0.999, 100, 100000);
      expect(result.f).toBe(result.lambda / 100000);
    });

    test('returns correct m value', () => {
      const result = getMResults(42, 0.999, 100, 100000);
      expect(result.m).toBe(42);
    });

    test('calculates expected values for specific inputs', () => {
      // based on well-known test case represented by form defaults: statisticsTarget=1000, elemsPerRow=3, confidence=0.999999
      const result = getMResults(17, 0.999999, 6, 300000);
      expect(result.m).toBe(17);
      expect(result.poissonCdf).toBeCloseTo(0.44366873, 6);
      expect(result.lambda).toBeCloseTo(6.0125325, 5);
      expect(result.f).toBeCloseTo(2.004178e-5, 10);
    });
  });
});

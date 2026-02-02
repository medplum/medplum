// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

const DEFAULT_TOLERANCE = 1e-10;

/**
 * Computes the cumulative distribution function of a Poisson distribution.
 * Returns P(X ≤ k) where X ~ Poisson(λ).
 *
 * @param k - The upper bound (non-negative integer)
 * @param lambda - The rate parameter (λ > 0)
 * @returns The probability that a Poisson(λ) random variable is at most k
 */
export function poissonCdfFn(k: number, lambda: number): number {
  let sum = 0;
  let term = Math.exp(-lambda);
  for (let i = 0; i <= k; i++) {
    if (i > 0) {
      term *= lambda / i;
    }
    sum += term;
  }
  return sum;
}

/**
 * Finds the minimum λ such that P(X ≤ k) ≤ p for X ~ Poisson(λ).
 * Uses bisection search to invert the Poisson CDF.
 *
 * @param p - The target cumulative probability (0 < p < 1)
 * @param k - The upper bound (non-negative integer)
 * @param tolerance - Precision threshold for bisection (default: 1e-10)
 * @returns The minimum λ satisfying the constraint
 */
export function minLambda(p: number, k: number, tolerance = DEFAULT_TOLERANCE): number {
  let lo = 0;
  let hi = Math.max(k + 1, 1);

  // Expand upper bound until CDF < p
  while (poissonCdfFn(k, hi) > p) {
    hi *= 2;
  }

  // Bisection
  while (hi - lo > tolerance) {
    const mid = (lo + hi) / 2;
    if (poissonCdfFn(k, mid) > p) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return hi;
}

export type MResults = {
  m: number;
  poissonCdf: number;
  lambda: number;
  f: number;
};

export type CalculationResults = {
  rowsSampled: number;
  cutoffFrequencyExact: number;
  cutoffFrequency: number;
  minimumSelectivity: number;
  targetSelectivity: number;
  targetLambda: number;
  targetPoissonCdf: number;
  targetM: number;
  results: {
    name: string;
    result: MResults;
  }[];
};

export function calculate(
  statisticsTarget: number,
  elemsPerRow: number,
  confidence: number,
  selectivityOverride?: number
): CalculationResults {
  // compute minimum selectivity based on the formula from PostgreSQL's array column statistics source code
  const rowsSampled = statisticsTarget * 300;
  const cutoffFrequencyExact = (9 * elemsPerRow * rowsSampled) / ((statisticsTarget * 10 * 1000) / 7);
  const cutoffFrequency = Math.ceil(cutoffFrequencyExact);
  const minimumSelectivity = cutoffFrequency / rowsSampled;

  const targetSelectivity = Math.max(selectivityOverride ?? 0, minimumSelectivity);
  const targetFrequency = selectivityOverride ? targetSelectivity * rowsSampled : cutoffFrequency;
  const targetLambda = targetFrequency;

  // P(X ≤ (targetFrequency-1), lambda)
  const targetPoissonCdf = poissonCdfFn(targetFrequency - 1, targetLambda);

  // P(X ≤ (targetFrequency-1)) ≤ (1-p)^(1/m), solve for m: m ≥ log(1 - p) / log(P(X ≤ (targetFrequency-1)))
  const targetM = Math.log(1 - confidence) / Math.log(targetPoissonCdf);

  return {
    rowsSampled,
    cutoffFrequencyExact,
    cutoffFrequency,
    minimumSelectivity,
    targetSelectivity,
    targetLambda,
    targetPoissonCdf,
    targetM,
    results: [
      // Since `m` must be an integer, calculate values for both floor and ceiling of targetM
      {
        name: 'Floor',
        result: getMResults(Math.floor(targetM), confidence, targetFrequency, rowsSampled),
      },
      {
        name: 'Ceiling',
        result: getMResults(Math.ceil(targetM), confidence, targetFrequency, rowsSampled),
      },
    ],
  };
}

export function getMResults(m: number, confidence: number, frequency: number, rowsSampled: number): MResults {
  const poissonCdfValue = Math.pow(1 - confidence, 1 / m);
  const lambda = minLambda(poissonCdfValue, frequency - 1);
  const f = lambda / rowsSampled;
  return {
    m,
    poissonCdf: poissonCdfValue,
    lambda,
    f,
  };
}

export type NumberFormat = 'auto' | 'scientific' | 'fixed';

export function formatNumber(value: number, format: NumberFormat = 'auto', decimals: number = 6): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  if (format === 'scientific') {
    return value.toExponential(decimals);
  }
  if (format === 'fixed') {
    return value.toFixed(decimals);
  }
  // Auto format
  // For very small numbers, use scientific notation
  if (Math.abs(value) < 0.0001 && value !== 0) {
    return value.toExponential(decimals);
  }
  // For numbers that are essentially integers
  if (Math.abs(value - Math.round(value)) < 1e-10) {
    return Math.round(value).toString();
  }
  return value.toPrecision(8);
}

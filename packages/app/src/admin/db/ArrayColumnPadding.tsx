// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Grid, NumberInput, Paper, Stack, Text, Title } from '@mantine/core';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';

const DEFAULT_TOLERANCE = 1e-10;

/**
 * Computes the cumulative distribution function of a Poisson distribution.
 * Returns P(X ≤ k) where X ~ Poisson(λ).
 *
 * @param k - The upper bound (non-negative integer)
 * @param lambda - The rate parameter (λ > 0)
 * @returns The probability that a Poisson(λ) random variable is at most k
 */
function poissonCdfFn(k: number, lambda: number): number {
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
function minLambda(p: number, k: number, tolerance = DEFAULT_TOLERANCE): number {
  let lo = 0;
  let hi = Math.max(k + 1, 1);

  // Expand upper bound until CDF < p
  while (poissonCdfFn(k, hi) > p) {
    hi *= 2;
    console.log('expand', { lo, hi });
  }

  // Bisection
  while (hi - lo > tolerance) {
    const mid = (lo + hi) / 2;
    console.log('bisect', { lo, hi, mid, poisson: poissonCdfFn(k, mid) });
    if (poissonCdfFn(k, mid) > p) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return hi;
}

type MResults = {
  m: number;
  poissonCdf: number;
  lambda: number;
  f: number;
};
type CalculationResults = {
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

function calculate(
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

function getMResults(m: number, confidence: number, frequency: number, rowsSampled: number): MResults {
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

type NumberFormat = 'auto' | 'scientific' | 'fixed';

function formatNumber(value: number, format: NumberFormat = 'auto', decimals: number = 6): string {
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

interface ResultRowProps {
  readonly label: string;
  readonly value: number;
  readonly format?: NumberFormat;
  readonly decimals?: number;
}

function ResultRow({ label, value, format = 'auto', decimals = 6 }: ResultRowProps): JSX.Element {
  return (
    <Grid>
      <Grid.Col span={8}>
        <Text size="sm">{label}</Text>
      </Grid.Col>
      <Grid.Col span={4}>
        <Text size="sm" ff="monospace" ta="right">
          {formatNumber(value, format, decimals)}
        </Text>
      </Grid.Col>
    </Grid>
  );
}

interface ResultGroupProps {
  readonly title: string;
  readonly m: number;
  readonly poissonCdf: number;
  readonly lambda: number;
  readonly f: number;
}

function ResultGroup({ title, m, poissonCdf, lambda, f }: ResultGroupProps): JSX.Element {
  return (
    <Paper withBorder p="md">
      <Title order={4} mb="sm">
        {title}
      </Title>
      <Stack gap="xs">
        <ResultRow label="M (padding multiplier)" value={m} />
        <ResultRow label="Poisson CDF" value={poissonCdf} />
        <ResultRow label="Lambda" value={lambda} />
        <ResultRow label="F (selectivity)" value={f} format="scientific" />
      </Stack>
    </Paper>
  );
}

export function ArrayColumnPadding(): JSX.Element {
  const [statisticsTarget, setStatisticsTarget] = useState<number | string>(1000);
  const [elemsPerRow, setElemsPerRow] = useState<number | string>(3);
  const [confidence, setConfidence] = useState<number | string>(0.999999);
  const [selectivityOverride, setSelectivityOverride] = useState<number | string>('');

  const results = useMemo(() => {
    const stats = typeof statisticsTarget === 'number' ? statisticsTarget : undefined;
    const elems = typeof elemsPerRow === 'number' ? elemsPerRow : undefined;
    const conf = typeof confidence === 'number' ? confidence : undefined;
    const override = typeof selectivityOverride === 'number' ? selectivityOverride : undefined;

    if (stats === undefined || elems === undefined || conf === undefined) {
      return undefined;
    }

    if (stats < 100 || stats > 10000 || elems < 1 || conf <= 0 || conf >= 1) {
      return undefined;
    }

    return calculate(stats, elems, conf, override);
  }, [statisticsTarget, elemsPerRow, confidence, selectivityOverride]);

  return (
    <Stack gap="lg">
      <Paper withBorder p="md">
        <Title order={4} mb="md">
          Inputs
        </Title>
        <Grid>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <NumberInput
              label="Statistics Target"
              value={statisticsTarget}
              onChange={setStatisticsTarget}
              min={100}
              max={10000}
              step={100}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <NumberInput
              label="Elements Per Row"
              value={elemsPerRow}
              onChange={setElemsPerRow}
              min={1}
              max={1000}
              step={1}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <NumberInput
              label="Confidence"
              value={confidence}
              onChange={setConfidence}
              min={0}
              max={1}
              step={0.000001}
              decimalScale={10}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <NumberInput
              label="Target Selectivity (optional)"
              description="Overrides minimum selectivity"
              value={selectivityOverride}
              onChange={setSelectivityOverride}
              min={0}
              max={1}
              step={0.00001}
              decimalScale={10}
              placeholder={results ? formatNumber(results.minimumSelectivity, 'scientific') : ''}
            />
          </Grid.Col>
        </Grid>
      </Paper>

      {results && (
        <>
          <Paper withBorder p="md">
            <Title order={4} mb="sm">
              Intermediate Values
            </Title>
            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Stack gap="xs">
                  <ResultRow label="Rows Sampled" value={results.rowsSampled} />
                  <ResultRow label="Cutoff Frequency (exact)" value={results.cutoffFrequencyExact} />
                  <ResultRow label="Cutoff Frequency" value={results.cutoffFrequency} />
                  <ResultRow label="Min Selectivity" value={results.minimumSelectivity} format="scientific" />
                </Stack>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Stack gap="xs">
                  <ResultRow label="Target Selectivity" value={results.targetSelectivity} format="scientific" />
                  <ResultRow label="Target Lambda" value={results.targetLambda} />
                  <ResultRow label="Target Poisson CDF" value={results.targetPoissonCdf} />
                  <ResultRow label="Target m" value={results.targetM} />
                </Stack>
              </Grid.Col>
            </Grid>
          </Paper>

          <Grid>
            {results.results.map(({ name, result }) => (
              <Grid.Col span={{ base: 12, md: 6 }} key={name}>
                <ResultGroup
                  title={`${name} Option`}
                  m={result.m}
                  poissonCdf={result.poissonCdf}
                  lambda={result.lambda}
                  f={result.f}
                />
              </Grid.Col>
            ))}
          </Grid>
        </>
      )}
    </Stack>
  );
}

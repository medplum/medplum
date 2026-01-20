// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Grid, NumberInput, Paper, Stack, Text, Title } from '@mantine/core';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';

interface CalculationResults {
  rowsSampled: number;
  cutoffFrequencyExact: number;
  cutoffFrequency: number;
  minimumSelectivity: number;
  targetLambda: number;
  poissonCdf: number;
  minimumM: number;
  floorM: number;
  floorPoissonCdf: number;
  floorLambda: number;
  floorF: number;
  ceilM: number;
  ceilPoissonCdf: number;
  ceilLambda: number;
  ceilF: number;
}

/**
 * Compute log of gamma function using Lanczos approximation
 */
function logGamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];

  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }

  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Compute the regularized lower incomplete gamma function P(a, x)
 * using series expansion for small x and continued fraction for large x
 */
function regularizedGammaP(a: number, x: number): number {
  if (x < 0 || a <= 0) {
    return 0;
  }
  if (x === 0) {
    return 0;
  }

  // Use series expansion for x < a + 1
  if (x < a + 1) {
    let sum = 1 / a;
    let term = 1 / a;
    for (let n = 1; n < 200; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-15) {
        break;
      }
    }
    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }

  // Use continued fraction for x >= a + 1
  const fpmin = 1e-300;
  let b = x + 1 - a;
  let c = 1 / fpmin;
  let d = 1 / b;
  let h = d;

  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < fpmin) {
      d = fpmin;
    }
    c = b + an / c;
    if (Math.abs(c) < fpmin) {
      c = fpmin;
    }
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) {
      break;
    }
  }

  return 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/**
 * Poisson CDF: P(X <= k) for X ~ Poisson(lambda)
 * This equals the regularized upper incomplete gamma function Q(k+1, lambda)
 * which equals 1 - P(k+1, lambda)
 */
function poissonCdf(k: number, lambda: number): number {
  if (lambda <= 0) {
    return k >= 0 ? 1 : 0;
  }
  if (k < 0) {
    return 0;
  }
  return 1 - regularizedGammaP(k + 1, lambda);
}

/**
 * Inverse of the gamma CDF (quantile function)
 * Find lambda such that P(k, lambda) = p using Newton's method
 * For gamma distribution with shape=k and scale=1
 */
function gammaInv(p: number, k: number, _scale: number, tolerance: number = 1e-10): number {
  if (p <= 0) {
    return 0;
  }
  if (p >= 1) {
    return Infinity;
  }

  // Initial guess using Wilson-Hilferty approximation
  let lambda = k;
  if (k > 1) {
    const normalQuantile = Math.sqrt(2) * inverseErf(2 * p - 1);
    const tmp = 1 - 2 / (9 * k) + normalQuantile * Math.sqrt(2 / (9 * k));
    lambda = k * tmp * tmp * tmp;
    if (lambda <= 0) {
      lambda = k;
    }
  }

  // Newton-Raphson iteration
  for (let i = 0; i < 100; i++) {
    const cdf = regularizedGammaP(k, lambda);
    const error = cdf - p;

    if (Math.abs(error) < tolerance) {
      break;
    }

    // PDF of gamma distribution (derivative of CDF)
    const pdf = Math.exp((k - 1) * Math.log(lambda) - lambda - logGamma(k));
    if (pdf === 0) {
      break;
    }

    const delta = error / pdf;
    lambda = Math.max(lambda - delta, lambda / 10);
  }

  return lambda;
}

/**
 * Inverse error function approximation
 */
function inverseErf(x: number): number {
  const a = 0.147;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);

  const ln1mx2 = Math.log(1 - x * x);
  const part1 = 2 / (Math.PI * a) + ln1mx2 / 2;
  const part2 = ln1mx2 / a;

  return sign * Math.sqrt(Math.sqrt(part1 * part1 - part2) - part1);
}

function calculate(
  statisticsTarget: number,
  elemsPerRow: number,
  confidence: number,
  selectivityOverride?: number
): CalculationResults {
  const rowsSampled = statisticsTarget * 300;
  const cutoffFrequencyExact = (9 * elemsPerRow * rowsSampled) / ((statisticsTarget * 10 * 1000) / 7);
  const cutoffFrequency = Math.ceil(cutoffFrequencyExact);
  const minimumSelectivity = cutoffFrequency / rowsSampled;

  // Use override if provided, otherwise use calculated minimum
  const targetSelectivity = selectivityOverride ?? minimumSelectivity;
  const effectiveCutoffFrequency = selectivityOverride ? Math.ceil(targetSelectivity * rowsSampled) : cutoffFrequency;

  const targetLambda = effectiveCutoffFrequency;
  const poissonCdfValue = poissonCdf(effectiveCutoffFrequency - 1, targetLambda);
  const minimumM = Math.log(1 - confidence) / Math.log(poissonCdfValue);

  // Floor calculations
  const floorM = Math.floor(minimumM);
  const floorPoissonCdf = Math.pow(1 - confidence, 1 / floorM);
  const floorLambda = gammaInv(1 - floorPoissonCdf, effectiveCutoffFrequency, 1);
  const floorF = floorLambda / rowsSampled;

  // Ceil calculations
  const ceilM = Math.ceil(minimumM);
  const ceilPoissonCdf = Math.pow(1 - confidence, 1 / ceilM);
  const ceilLambda = gammaInv(1 - ceilPoissonCdf, effectiveCutoffFrequency, 1);
  const ceilF = ceilLambda / rowsSampled;

  return {
    rowsSampled,
    cutoffFrequencyExact,
    cutoffFrequency,
    minimumSelectivity,
    targetLambda,
    poissonCdf: poissonCdfValue,
    minimumM,
    floorM,
    floorPoissonCdf,
    floorLambda,
    floorF,
    ceilM,
    ceilPoissonCdf,
    ceilLambda,
    ceilF,
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
                </Stack>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Stack gap="xs">
                  <ResultRow label="Minimum Selectivity" value={results.minimumSelectivity} format="scientific" />
                  <ResultRow label="Target Lambda" value={results.targetLambda} />
                  <ResultRow label="Poisson CDF" value={results.poissonCdf} />
                  <ResultRow label="Minimum M" value={results.minimumM} />
                </Stack>
              </Grid.Col>
            </Grid>
          </Paper>

          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <ResultGroup
                title="Floor Option"
                m={results.floorM}
                poissonCdf={results.floorPoissonCdf}
                lambda={results.floorLambda}
                f={results.floorF}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <ResultGroup
                title="Ceiling Option"
                m={results.ceilM}
                poissonCdf={results.ceilPoissonCdf}
                lambda={results.ceilLambda}
                f={results.ceilF}
              />
            </Grid.Col>
          </Grid>
        </>
      )}
    </Stack>
  );
}

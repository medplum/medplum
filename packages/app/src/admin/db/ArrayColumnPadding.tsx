// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Grid, NumberInput, Paper, Stack, Text, Title } from '@mantine/core';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import type { NumberFormat } from './arrayColumnPaddingUtils';
import { calculate, formatNumber } from './arrayColumnPaddingUtils';

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

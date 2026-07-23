// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Attributes, Counter, Gauge, Histogram, Meter, MetricOptions } from '@opentelemetry/api';
import { metrics } from '@opentelemetry/api';

let meter: Meter | undefined = undefined;
const counters = new Map<string, Counter>();
const histograms = new Map<string, Histogram>();
const gauges = new Map<string, Gauge>();

export type RecordMetricOptions = {
  attributes?: Attributes;
  options?: MetricOptions;
};

function getMeter(): Meter {
  meter ??= metrics.getMeter('medplum');
  return meter;
}

export function getCounter(name: string, options?: MetricOptions): Counter {
  let result = counters.get(name);
  if (!result) {
    result = getMeter().createCounter(name, options);
    counters.set(name, result);
  }
  return result;
}

export function incrementCounter(name: string, options?: RecordMetricOptions, n = 1): boolean {
  if (!isOtelMetricsEnabled()) {
    return false;
  }
  getCounter(name, options?.options).add(n, options?.attributes);
  return true;
}

export function getHistogram(name: string, options?: MetricOptions): Histogram {
  let result = histograms.get(name);
  if (!result) {
    result = getMeter().createHistogram(name, options);
    histograms.set(name, result);
  }
  return result;
}

export function recordHistogramValue(name: string, value: number, options?: RecordMetricOptions): boolean {
  if (!isOtelMetricsEnabled()) {
    return false;
  }
  getHistogram(name, options?.options).record(value, options?.attributes);
  return true;
}

export function getGauge(name: string, options?: MetricOptions): Gauge {
  let result = gauges.get(name);
  if (!result) {
    result = getMeter().createGauge(name, options);
    gauges.set(name, result);
  }
  return result;
}

export function setGauge(name: string, value: number, options?: RecordMetricOptions): boolean {
  if (!isOtelMetricsEnabled()) {
    return false;
  }
  getGauge(name, options?.options).record(value, options?.attributes);
  return true;
}

function isOtelMetricsEnabled(): boolean {
  return !!process.env.OTLP_METRICS_ENDPOINT;
}

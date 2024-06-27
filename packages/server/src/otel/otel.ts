import opentelemetry, { Attributes, Counter, Histogram, Meter } from '@opentelemetry/api';
import { Gauge } from '@opentelemetry/sdk-metrics/build/src/types';

// This file includes OpenTelemetry helpers.
// Note that this file is related but separate from the OpenTelemetry initialization code in instrumentation.ts.
// The instrumentation.ts code is used to initialize OpenTelemetry.
// This file is used to record metrics.

let meter: Meter | undefined = undefined;
const counters = new Map<string, Counter>();
const histograms = new Map<string, Histogram>();
const gauges = new Map<string, Gauge>();

function getMeter(): Meter {
  if (!meter) {
    meter = opentelemetry.metrics.getMeter('medplum');
  }
  return meter;
}

function getCounter(name: string): Counter {
  let result = counters.get(name);
  if (!result) {
    result = getMeter().createCounter(name);
    counters.set(name, result);
  }
  return result;
}

function getGauge(name: string): Gauge {
  let result = gauges.get(name);
  if (!result) {
    result = getMeter().createGauge(name);
    gauges.set(name, result);
  }
  return result;
}

export function incrementCounter(name: string, attributes: Attributes): boolean {
  if (!isOtelMetricsEnabled()) {
    return false;
  }
  getCounter(name).add(1, attributes);
  return true;
}

function getHistogram(name: string): Histogram {
  let result = histograms.get(name);
  if (!result) {
    result = getMeter().createHistogram(name);
    histograms.set(name, result);
  }
  return result;
}

export function recordHistogramValue(name: string, value: number, attributes: Attributes): boolean {
  if (!isOtelMetricsEnabled()) {
    return false;
  }
  getHistogram(name).record(value, attributes);
  return true;
}

export function setGauge(name: string, value: number, attributes?: Attributes): boolean {
  if (!isOtelMetricsEnabled()) {
    return false;
  }
  getGauge(name).record(value, attributes);
  return true;
}

function isOtelMetricsEnabled(): boolean {
  return !!process.env.OTLP_METRICS_ENDPOINT;
}

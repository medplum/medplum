import opentelemetry, { Counter, Histogram, Meter } from '@opentelemetry/api';

let meter: Meter | undefined = undefined;
const counters = new Map<string, Counter>();
const histograms = new Map<string, Histogram>();

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

export function incrementCounter(name: string): void {
  if (isOtelMetricsEnabled()) {
    getCounter(name).add(1);
  }
}

function getHistogram(name: string): Histogram {
  let result = histograms.get(name);
  if (!result) {
    result = getMeter().createHistogram(name);
    histograms.set(name, result);
  }
  return result;
}

export function recordHistogramValue(name: string, value: number): void {
  if (isOtelMetricsEnabled()) {
    getHistogram(name).record(value);
  }
}

function isOtelMetricsEnabled(): boolean {
  return !!process.env.OTLP_METRICS_ENDPOINT;
}

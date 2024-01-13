import { MEDPLUM_VERSION } from '@medplum/core';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { Resource } from '@opentelemetry/resources';
import { MetricReader, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { SpanExporter } from '@opentelemetry/sdk-trace-base';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

// Configures OpenTelemetry for Node.js
// https://opentelemetry.io/docs/instrumentation/js/getting-started/nodejs/
// https://opentelemetry.io/docs/instrumentation/js/exporters/

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

let sdk: NodeSDK | undefined = undefined;

export function initOpenTelemetry(): void {
  const OTLP_METRICS_ENDPOINT = process.env.OTLP_METRICS_ENDPOINT;
  const OTLP_TRACES_ENDPOINT = process.env.OTLP_TRACE_ENDPOINT;
  if (!OTLP_METRICS_ENDPOINT && !OTLP_TRACES_ENDPOINT) {
    return;
  }

  const resource = Resource.default().merge(
    new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'medplum',
      [SemanticResourceAttributes.SERVICE_VERSION]: MEDPLUM_VERSION,
    })
  );

  let metricReader: MetricReader | undefined = undefined;
  if (OTLP_METRICS_ENDPOINT) {
    const exporter = new OTLPMetricExporter({ url: OTLP_METRICS_ENDPOINT });
    metricReader = new PeriodicExportingMetricReader({ exporter });
  }

  let traceExporter: SpanExporter | undefined = undefined;
  if (OTLP_TRACES_ENDPOINT) {
    traceExporter = new OTLPTraceExporter({ url: OTLP_TRACES_ENDPOINT });
  }

  const instrumentations = [getNodeAutoInstrumentations()];

  sdk = new NodeSDK({
    resource,
    instrumentations,
    metricReader,
    traceExporter,
  });

  sdk.start();
}

export async function shutdownOpenTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = undefined;
  }
}

if (require.main === undefined) {
  // There are 2 ways that this file can be loaded:
  // 1. As a "require" from the command line when starting the server
  // 2. As an "import" from the unit tests
  // We want to initialize OpenTelemetry only when starting the server
  initOpenTelemetry();
}

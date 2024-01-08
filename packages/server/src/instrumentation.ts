import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { MedplumServerConfig } from './config';

// Configures OpenTelemetry for Node.js
// https://opentelemetry.io/docs/instrumentation/js/getting-started/nodejs/
// https://opentelemetry.io/docs/instrumentation/js/exporters/

let sdk: NodeSDK | undefined = undefined;

export function initOpenTelemetry(config: MedplumServerConfig): void {
  if (!config.otlpMetricsEndpoint && !config.otlpTraceEndpoint) {
    return;
  }

  sdk = new NodeSDK({
    traceExporter: config.otlpTraceEndpoint ? new OTLPTraceExporter({ url: config.otlpTraceEndpoint }) : undefined,
    metricReader: config.otlpMetricsEndpoint
      ? new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({
            url: config.otlpMetricsEndpoint,
          }),
        })
      : undefined,
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
}

export async function shutdownOpenTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = undefined;
  }
}

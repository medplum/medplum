import { MEDPLUM_VERSION } from '@medplum/core';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
// import { AwsLambdaInstrumentation } from '@opentelemetry/instrumentation-aws-lambda';
// import { AwsInstrumentation } from '@opentelemetry/instrumentation-aws-sdk';
// import { DataloaderInstrumentation } from '@opentelemetry/instrumentation-dataloader';
// import { DnsInstrumentation } from '@opentelemetry/instrumentation-dns';
// import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
// import FsInstrumentation from '@opentelemetry/instrumentation-fs';
// import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
// import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
// import { NetInstrumentation } from '@opentelemetry/instrumentation-net';
// import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node';
// import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { Resource } from '@opentelemetry/resources';
import { MetricReader, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { SpanExporter } from '@opentelemetry/sdk-trace-base';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

// This file includes OpenTelemetry instrumentation.
// Note that this file is related but separate from the OpenTelemetry helpers in otel.ts.
// This file is used to initialize OpenTelemetry, and must be loaded before any other code.
//
// References:
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
      [SEMRESATTRS_SERVICE_NAME]: 'medplum',
      [SEMRESATTRS_SERVICE_VERSION]: MEDPLUM_VERSION,
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

  const instrumentations = [
    new RuntimeNodeInstrumentation(),
    // new FsInstrumentation(),
    // new NetInstrumentation(),
    // new DnsInstrumentation(),
    new HttpInstrumentation(),
    // new UndiciInstrumentation(),

    // new PgInstrumentation(),
    // new IORedisInstrumentation(),

    // new ExpressInstrumentation(),
    // new GraphQLInstrumentation({
    //   ignoreTrivialResolveSpans: true, // Don't record simple object property lookups
    // }),
    // new DataloaderInstrumentation(),

    // new AwsInstrumentation(),
    // new AwsLambdaInstrumentation(),
  ];

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

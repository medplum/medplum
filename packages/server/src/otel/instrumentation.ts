// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { BullMQInstrumentation } from '@appsignal/opentelemetry-instrumentation-bullmq';
import { MEDPLUM_VERSION } from '@medplum/core';
import { diag, DiagConsoleLogger, DiagLogLevel, Span, SpanStatusCode } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { DataloaderInstrumentation } from '@opentelemetry/instrumentation-dataloader';
import { ExpressInstrumentation, ExpressLayerType } from '@opentelemetry/instrumentation-express';
import { GraphQLInstrumentation } from '@opentelemetry/instrumentation-graphql';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { PgInstrumentation, PgResponseHookInformation } from '@opentelemetry/instrumentation-pg';
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { MetricReader, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { SpanExporter } from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { ClientRequest, IncomingMessage, ServerResponse } from 'http';

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

  const resource = defaultResource().merge(
    resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'medplum',
      [ATTR_SERVICE_VERSION]: MEDPLUM_VERSION,
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
    new HttpInstrumentation({
      applyCustomAttributesOnSpan: httpResponseHook,
    }),

    new PgInstrumentation({
      enhancedDatabaseReporting: true,
      requireParentSpan: true,
      responseHook: pgResponseHook,
    }),
    new IORedisInstrumentation(),

    new ExpressInstrumentation({
      // In order to reduce the number of spans in traces sent to the backend, we omit
      // some common middleware that don't contribute interesting information to the
      // request timeline.  These generally take ~zero time to run and don't fail specifically
      ignoreLayers: [
        'expressInit',
        'query',
        'urlencodedParser',
        'textParser',
        'setupResponseInterceptors',
        'standardHeaders',
        'corsMiddleware',
        'compression',
      ].map((name) => `middleware - ${name}`),
      ignoreLayersType: [ExpressLayerType.ROUTER],
    }),
    new GraphQLInstrumentation({
      ignoreTrivialResolveSpans: true, // Don't record simple object property lookups
    }),
    new DataloaderInstrumentation(),
    new BullMQInstrumentation({
      requireParentSpanForPublish: true,
    }),
  ];

  sdk = new NodeSDK({ resource, instrumentations, metricReader, traceExporter });
  sdk.start();
}

export function httpResponseHook(
  span: Span,
  req: IncomingMessage | ClientRequest,
  res: ServerResponse | IncomingMessage
): void {
  // All error traces are kept, but others may be sampled
  const code = res.statusCode && res.statusCode < 500 ? SpanStatusCode.OK : SpanStatusCode.ERROR;
  span.setStatus({ code });
  span.setAttribute('http.method', req.method ?? 'unknown');
}

export function pgResponseHook(span: Span, { data }: PgResponseHookInformation): void {
  if (data.rowCount !== null) {
    span.setAttribute('medplum.db.rowCount', data.rowCount);
  }
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

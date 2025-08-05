// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Span, SpanStatusCode } from '@opentelemetry/api';
import { PgResponseHookInformation } from '@opentelemetry/instrumentation-pg';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { IncomingMessage, ServerResponse } from 'http';
import { httpResponseHook, initOpenTelemetry, pgResponseHook, shutdownOpenTelemetry } from './instrumentation';

describe('Instrumentation', () => {
  const OLD_ENV = process.env;
  let sdkSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    sdkSpy = jest.spyOn(NodeSDK.prototype, 'start').mockImplementation(() => jest.fn());
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('None', async () => {
    initOpenTelemetry();
    await shutdownOpenTelemetry();
    expect(sdkSpy).not.toHaveBeenCalled();
  });

  test('Both metrics and traces', async () => {
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';
    process.env.OTLP_TRACE_ENDPOINT = 'http://localhost:4318/v1/traces';
    initOpenTelemetry();
    await shutdownOpenTelemetry();
    expect(sdkSpy).toHaveBeenCalled();
  });

  test('Only metrics', async () => {
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';
    initOpenTelemetry();
    await shutdownOpenTelemetry();
    expect(sdkSpy).toHaveBeenCalled();
  });

  test('Only traces', async () => {
    process.env.OTLP_TRACE_ENDPOINT = 'http://localhost:4318/v1/traces';
    initOpenTelemetry();
    await shutdownOpenTelemetry();
    expect(sdkSpy).toHaveBeenCalled();
  });

  test('HTTP response hook', async () => {
    const span = {
      setAttribute: jest.fn(),
      setStatus: jest.fn(),
    } as unknown as Span;

    httpResponseHook(
      span,
      { method: 'PUT' } as unknown as IncomingMessage,
      { statusCode: 500 } as unknown as ServerResponse
    );

    expect(span.setAttribute).toHaveBeenCalledWith('http.method', 'PUT');
    expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.ERROR });
  });

  test('Postgres response hook', async () => {
    const span = {
      setAttribute: jest.fn(),
    } as unknown as Span;

    pgResponseHook(span, { data: { rowCount: 21 } } as unknown as PgResponseHookInformation);

    expect(span.setAttribute).toHaveBeenCalledWith('medplum.db.rowCount', 21);
  });

  test('Postgres response hook -- null rowCount', async () => {
    const span = {
      setAttribute: jest.fn(),
    } as unknown as Span;

    pgResponseHook(span, { data: { rowCount: null } } as unknown as PgResponseHookInformation);

    expect(span.setAttribute).not.toHaveBeenCalled();
  });
});

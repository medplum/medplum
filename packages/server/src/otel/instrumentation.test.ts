import { NodeSDK } from '@opentelemetry/sdk-node';
import { initOpenTelemetry, shutdownOpenTelemetry } from './instrumentation';
import { initApp } from '../app';
import { loadTestConfig } from '../config/loader';
import express from 'express';
import request from 'supertest';

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

  test('Both metrics and traces', async () => {
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';
    process.env.OTLP_TRACE_ENDPOINT = 'http://localhost:4318/v1/traces';
    initOpenTelemetry();

    const app = express();
    const config = await loadTestConfig();
    await initApp(app, config);

    await request(app).get('/healthcheck').send();

    await shutdownOpenTelemetry();
    expect(sdkSpy).toHaveBeenCalled();
  });
});

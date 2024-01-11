import { NodeSDK } from '@opentelemetry/sdk-node';
import { MedplumServerConfig } from './config';
import { initOpenTelemetry, shutdownOpenTelemetry } from './instrumentation';

describe('Instrumentation', () => {
  let sdkSpy: jest.SpyInstance;

  beforeEach(() => {
    sdkSpy = jest.spyOn(NodeSDK.prototype, 'start').mockImplementation(() => jest.fn());
  });

  test('None', async () => {
    initOpenTelemetry({} as MedplumServerConfig);
    await shutdownOpenTelemetry();
    expect(sdkSpy).not.toHaveBeenCalled();
  });

  test('Both metrics and traces', async () => {
    initOpenTelemetry({
      otlpMetricsEndpoint: 'http://localhost:4318/v1/metrics',
      otlpTraceEndpoint: 'http://localhost:4318/v1/traces',
    } as MedplumServerConfig);
    await shutdownOpenTelemetry();
    expect(sdkSpy).toHaveBeenCalled();
  });

  test('Only metrics', async () => {
    initOpenTelemetry({
      otlpMetricsEndpoint: 'http://localhost:4318/v1/metrics',
    } as MedplumServerConfig);
    await shutdownOpenTelemetry();
    expect(sdkSpy).toHaveBeenCalled();
  });

  test('Only traces', async () => {
    initOpenTelemetry({
      otlpTraceEndpoint: 'http://localhost:4318/v1/traces',
    } as MedplumServerConfig);
    await shutdownOpenTelemetry();
    expect(sdkSpy).toHaveBeenCalled();
  });
});

import { incrementCounter, recordHistogramValue } from '../otel/otel';

describe('OpenTelemetry', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.resetAllMocks();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test('Increment counter, disabled', async () => {
    expect(incrementCounter('test', {})).toBe(false);
  });

  test('Increment counter, enabled', async () => {
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';
    expect(incrementCounter('test', {})).toBe(true);
  });

  test('Record histogram value, disabled', async () => {
    expect(recordHistogramValue('test', 1, {})).toBe(false);
  });

  test('Record histogram value, enabled', async () => {
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';
    expect(recordHistogramValue('test', 1, {})).toBe(true);
  });
});

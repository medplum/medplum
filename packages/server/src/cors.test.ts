import { Request } from 'express';
import { vi } from 'vitest';
import { getConfig, loadTestConfig } from './config';
import { corsOptions } from './cors';

describe('CORS', () => {
  beforeEach(async () => {
    await loadTestConfig();
  });

  test('Root', () => {
    const req = {
      header: () => undefined,
      path: '/',
    } as unknown as Request;
    const callback = vi.fn();
    corsOptions(req, callback);
    expect(callback).toBeCalledWith(null, { origin: false });
  });

  test('No Origin', () => {
    const req = {
      header: () => undefined,
      path: '/fhir/R4/Patient',
    } as unknown as Request;
    const callback = vi.fn();
    corsOptions(req, callback);
    expect(callback).toBeCalledWith(null, { origin: false });
  });

  test('Allow appBaseUrl', () => {
    const req = {
      header: () => 'http://localhost:3000',
      path: '/fhir/R4/Patient',
    } as unknown as Request;
    const callback = vi.fn();
    corsOptions(req, callback);
    expect(callback).toBeCalledWith(null, { credentials: true, origin: 'http://localhost:3000' });
  });

  test('Open', () => {
    getConfig().corsMode = 'open';
    const req = {
      header: () => 'https://example.com',
      path: '/fhir/R4/Patient',
    } as unknown as Request;
    const callback = vi.fn();
    corsOptions(req, callback);
    expect(callback).toBeCalledWith(null, { credentials: true, origin: 'https://example.com' });
  });

  test('Closed', () => {
    const req = {
      header: () => 'https://example.com',
      path: '/fhir/R4/Patient',
    } as unknown as Request;
    const callback = vi.fn();
    corsOptions(req, callback);
    expect(callback).toBeCalledWith(null, { origin: false });
  });
});

import { Request } from 'express';
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
    const callback = jest.fn();
    corsOptions(req, callback);
    expect(callback).toHaveBeenCalledWith(null, { origin: false });
  });

  test('No Origin', () => {
    const req = {
      header: () => undefined,
      path: '/fhir/R4/Patient',
    } as unknown as Request;
    const callback = jest.fn();
    corsOptions(req, callback);
    expect(callback).toHaveBeenCalledWith(null, { origin: false });
  });

  test('Allow appBaseUrl', () => {
    const req = {
      header: () => 'http://localhost:3000',
      path: '/fhir/R4/Patient',
    } as unknown as Request;
    const callback = jest.fn();
    corsOptions(req, callback);
    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ credentials: true, origin: 'http://localhost:3000' })
    );
  });

  test('Open', () => {
    getConfig().allowedOrigins = '*';
    const req = {
      header: () => 'https://example.com',
      path: '/fhir/R4/Patient',
    } as unknown as Request;
    const callback = jest.fn();
    corsOptions(req, callback);
    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ credentials: true, origin: 'https://example.com' })
    );
  });

  test('Closed', () => {
    getConfig().allowedOrigins = undefined;
    const req = {
      header: () => 'https://example.com',
      path: '/fhir/R4/Patient',
    } as unknown as Request;
    const callback = jest.fn();
    corsOptions(req, callback);
    expect(callback).toHaveBeenCalledWith(null, { origin: false });
  });

  test('Allowed origins ', () => {
    getConfig().allowedOrigins = 'https://abc.com,https://example.com';
    const req = {
      header: () => 'https://example.com',
      path: '/fhir/R4/Patient',
    } as unknown as Request;
    const callback = jest.fn();
    corsOptions(req, callback);
    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ credentials: true, origin: 'https://example.com' })
    );
  });

  test('Disallowed origins ', () => {
    getConfig().allowedOrigins = 'https://abc.com,https://def.com';
    const req = {
      header: () => 'https://example.com',
      path: '/fhir/R4/Patient',
    } as unknown as Request;
    const callback = jest.fn();
    corsOptions(req, callback);
    expect(callback).toHaveBeenCalledWith(null, { origin: false });
  });
});

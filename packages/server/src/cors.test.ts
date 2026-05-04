// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import express, { type Request } from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from './app';
import { getConfig, loadTestConfig } from './config/loader';
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

  test('Exposes RateLimit header on FHIR requests', () => {
    const req = {
      header: () => 'http://localhost:3000',
      path: '/fhir/R4/Patient',
    } as unknown as Request;
    const callback = jest.fn();
    corsOptions(req, callback);
    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ exposedHeaders: expect.arrayContaining(['RateLimit']) })
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

  test('FHIR response includes RateLimit in Access-Control-Expose-Headers', async () => {
    const app = express();
    const config = await loadTestConfig();
    await initApp(app, config);
    const res = await request(app).get('/fhir/R4/Patient').set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-expose-headers']).toBeDefined();
    expect(res.headers['access-control-expose-headers'].split(',').map((h: string) => h.trim())).toEqual(
      expect.arrayContaining(['RateLimit'])
    );
    expect(await shutdownApp()).toBeUndefined();
  });
});

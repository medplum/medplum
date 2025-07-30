import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';

describe('OAuth2 register', () => {
  const app = express();

  beforeAll(async () => {
    const config = await loadTestConfig();
    config.defaultOAuthClients = [
      {
        resourceType: 'ClientApplication',
        id: 'example',
        name: 'Example Client',
        secret: 'my-secret',
        redirectUri: 'https://example.com/callback',
      },
    ];

    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Missing redirect_uri', async () => {
    const res = await request(app).post('/oauth2/register').type('json').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Redirect URI is required');
  });

  test('Unknown redirect_uri', async () => {
    const res = await request(app)
      .post('/oauth2/register')
      .type('json')
      .send({
        redirect_uris: ['https://unknown.example.com/callback'],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Invalid redirect URI');
  });

  test('Success', async () => {
    const res = await request(app)
      .post('/oauth2/register')
      .type('json')
      .send({
        redirect_uris: ['https://example.com/callback'],
      });
    expect(res.status).toBe(201);
    expect(res.body.client_id).toBe('example');
    expect(res.body.client_secret).toBe('my-secret');
    expect(res.body.client_id_issued_at).toBeDefined();
  });
});

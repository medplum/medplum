import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { initTestAuth } from '../test.setup';

describe('MCP Routes', () => {
  const app = express();
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Unauthenticated streamable HTTP', async () => {
    const res = await request(app).get('/mcp/stream');
    expect(res.status).toBe(401);
  });

  test('Unauthenticated SSE', async () => {
    const res = await request(app).get('/mcp/sse');
    expect(res.status).toBe(401);
  });

  test('Streamable HTTP session not found', async () => {
    const res = await request(app)
      .post('/mcp/stream')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(res.status).toBe(400);
    expect(res.text).toStrictEqual(
      '{"jsonrpc":"2.0","error":{"code":-32000,"message":"Bad Request: No valid session ID provided"},"id":null}'
    );
  });

  test('Streamable HTTP success', async () => {
    const res1 = await request(app)
      .post('/mcp/stream')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: { sampling: {}, roots: { listChanged: true } },
          clientInfo: { name: 'mcp-inspector', version: '0.14.3' },
        },
      });
    expect(res1.status).toBe(200);
    expect(res1.text).toContain('event: message');
    expect(res1.text).toContain('data: {"result":{"protocolVersion":"2025-03-26"');

    const sessionId = res1.headers['mcp-session-id'];

    const res2 = await request(app)
      .post('/mcp/stream')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Accept', 'application/json, text/event-stream')
      .set('mcp-session-id', sessionId)
      .send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(res2.status).toBe(202);
  });
});

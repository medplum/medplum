// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getStatus, OperationOutcomeError } from '@medplum/core';
import { json, text, urlencoded } from 'body-parser';
import type { ErrorRequestHandler } from 'express';
import express from 'express';
import { gzipSync } from 'node:zlib';
import request from 'supertest';
import { createWebhookRawParser, parseWebhookBody, WEBHOOK_PATHS } from './bodyparser';

const app = express();
app.use(WEBHOOK_PATHS, createWebhookRawParser({ type: ['application/json', 'application/*+json'], limit: '1kb' }));
app.use(json({ type: ['application/json', 'application/*+json'] }));
app.use(urlencoded({ extended: false }));
app.use(text());
app.use((req, res) => res.json(parseWebhookBody(req.body)));
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  res.sendStatus(err instanceof OperationOutcomeError ? getStatus(err.outcome) : (err.status ?? 500));
};
app.use(errorHandler);

const rawBody = '{ "greeting": "café 🌍", "escaped": "\\u0061", "number": 1.00 }\n';

test.each(WEBHOOK_PATHS)('Captures exact JSON at %s while preserving parsed input', async (path) => {
  const result = await request(app)
    .post(path.replace(':projectId', 'project').replace(':id', 'membership'))
    .type('application/json')
    .send(rawBody);
  expect(result.status).toBe(200);
  expect(result.body).toEqual({ input: JSON.parse(rawBody), rawBody });
});

test('Does not retain JSON body on other routes', async () => {
  const result = await request(app).post('/fhir/R4/Bot/test/$execute').type('application/json').send(rawBody);
  expect(result.body).toEqual({ input: JSON.parse(rawBody) });
});

test('Leaves non-JSON bodies to existing parsers', async () => {
  const result = await request(app).post('/webhook/test').type('text/plain').send('hello');
  expect(result.body).toEqual({ input: 'hello' });
});

test('Retains the configured JSON size limit', async () => {
  const result = await request(app)
    .post('/webhook/test')
    .type('application/json')
    .send({ value: 'x'.repeat(1024) });
  expect(result.status).toBe(413);
});

test('Rejects malformed JSON before executing the webhook', async () => {
  const result = await request(app).post('/webhook/test').type('application/json').send('{invalid');
  expect(result.status).toBe(400);
});

test.each(['application/json; charset="UTF-8"', 'application/fhir+json', 'application/vendor+json'])(
  'Captures UTF-8 JSON with content type %s',
  async (contentType) => {
    const result = await request(app).post('/webhook/test').set('Content-Type', contentType).send(rawBody);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ input: JSON.parse(rawBody), rawBody });
  }
);

test.each(['{invalid', 'null', 'true', '42', '"string"', '   '])(
  'Rejects invalid or non-object JSON: %s',
  async (body) => {
    const result = await request(app).post('/webhook/test').type('application/json').send(body);
    expect(result.status).toBe(400);
  }
);

test.each(['', '[]', '\uFEFF{"value":1}'])('Preserves empty, array, and BOM handling: %s', async (body) => {
  const result = await request(app).post('/webhook/test').type('application/json').send(body);
  expect(result.status).toBe(200);
  expect(result.body).toEqual({ input: body ? JSON.parse(body.replace(/^\uFEFF/, '')) : {}, rawBody: body });
});

test('Leaves UTF-16 JSON to the existing parser without forwarding raw text', async () => {
  const result = await request(app)
    .post('/webhook/test')
    .set('Content-Type', 'application/json; charset=utf-16le')
    .serialize((body) => body)
    .send(Buffer.from(rawBody, 'utf16le'));
  expect(result.status).toBe(200);
  expect(result.body).toEqual({ input: JSON.parse(rawBody) });
});

test('Retains unsupported charset rejection', async () => {
  const result = await request(app)
    .post('/webhook/test')
    .set('Content-Type', 'application/json; charset=iso-8859-1')
    .send('{}');
  expect(result.status).toBe(415);
});

test('Captures decompressed JSON text', async () => {
  const result = await request(app)
    .post('/webhook/test')
    .type('application/json')
    .set('Content-Encoding', 'gzip')
    .serialize((body) => body)
    .send(gzipSync(rawBody));
  expect(result.status).toBe(200);
  expect(result.body).toEqual({ input: JSON.parse(rawBody), rawBody });
});

test('Leaves form bodies to the existing parser', async () => {
  const result = await request(app).post('/webhook/test').type('form').send({ value: 'hello' });
  expect(result.status).toBe(200);
  expect(result.body).toEqual({ input: { value: 'hello' } });
});

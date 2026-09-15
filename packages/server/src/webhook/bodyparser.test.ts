// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { json, text } from 'body-parser';
import express from 'express';
import request from 'supertest';
import { createWebhookJsonParser, WEBHOOK_PATHS } from './bodyparser';

const app = express();
app.use(WEBHOOK_PATHS, createWebhookJsonParser({ type: ['application/json', 'application/*+json'], limit: '1kb' }));
app.use(json());
app.use(text());
app.use((req, res) => res.json({ input: req.body, rawBody: res.locals.webhookRawBody }));

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

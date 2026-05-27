// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { FhircastMessagePayload, WithId } from '@medplum/core';
import {
  ContentType,
  createReference,
  generateId,
  getReferenceString,
  serializeFhircastSubscriptionRequest,
} from '@medplum/core';
import type { DiagnosticReport, Observation, Patient, Project } from '@medplum/fhirtypes';
import express from 'express';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import request from 'superwstest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import type { MedplumServerConfig } from '../config/types';
import { createTestProject, withTestContext } from '../test.setup';

const R4_BASE_ROUTE = '/fhircast/R4';

describe('FHIRcast R4 routes', () => {
  let app: express.Express;
  let config: MedplumServerConfig;
  let server: Server;
  let project: WithId<Project>;
  let accessToken: string;

  beforeAll(async () => {
    app = express();
    config = await loadTestConfig();
    config.heartbeatEnabled = false;
    server = await initApp(app, config);

    const result = await withTestContext(() =>
      createTestProject({ membership: { admin: true }, withAccessToken: true })
    );

    accessToken = result.accessToken;
    project = result.project;

    await new Promise<void>((resolve) => {
      server.listen(0, 'localhost', 8520, resolve);
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  // ==========================================================================
  // Well-known configuration
  // ==========================================================================

  test('Get well-known configuration', async () => {
    const res = await request(server).get(`${R4_BASE_ROUTE}/.well-known/fhircast-configuration`);

    expect(res.status).toBe(200);
    expect(res.body.eventsSupported).toBeDefined();
    expect(res.body.eventsSupported).toContain('Patient-open');
    expect(res.body.eventsSupported).toContain('DiagnosticReport-update');
    expect(res.body.getCurrentSupport).toBe(true);
    expect(res.body.websocketSupport).toBe(true);
    expect(res.body.webhookSupport).toBe(false);
    expect(res.body.fhircastVersion).toBe('STU3');
  });

  // ==========================================================================
  // Subscription - JSON body (backwards compatible)
  // ==========================================================================

  test('Subscribe with JSON body', async () => {
    const res = await request(server)
      .post(R4_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        'hub.channel.type': 'websocket',
        'hub.mode': 'subscribe',
        'hub.topic': 'test-topic-json',
        'hub.events': 'Patient-open,Patient-close',
      });

    expect(res.status).toBe(202);
    expect(res.body['hub.channel.endpoint']).toBeDefined();
    expect(res.body['hub.channel.endpoint']).toMatch(/ws.*\/ws\/fhircast-r4\//);
  });

  // ==========================================================================
  // Subscription - URL-encoded body (spec-compliant)
  // ==========================================================================

  test('Subscribe with URL-encoded body', async () => {
    const res = await request(server)
      .post(R4_BASE_ROUTE)
      .set('Content-Type', ContentType.FORM_URL_ENCODED)
      .set('Authorization', 'Bearer ' + accessToken)
      .send(
        serializeFhircastSubscriptionRequest({
          mode: 'subscribe',
          channelType: 'websocket',
          topic: 'test-topic-urlenc',
          events: ['Patient-open', 'Patient-close'],
        })
      );

    expect(res.status).toBe(202);
    expect(res.body['hub.channel.endpoint']).toBeDefined();
    expect(res.body['hub.channel.endpoint']).toMatch(/ws.*\/ws\/fhircast-r4\//);
  });

  // ==========================================================================
  // Subscription - auth required
  // ==========================================================================

  test('Subscribe without auth returns 401', async () => {
    const res = await request(server)
      .post(R4_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .send({
        'hub.channel.type': 'websocket',
        'hub.mode': 'subscribe',
        'hub.topic': 'topic',
        'hub.events': 'Patient-open',
      });

    expect(res.status).toBe(401);
  });

  // ==========================================================================
  // Subscription - validation
  // ==========================================================================

  test('Subscribe missing hub.channel.type', async () => {
    const res = await request(server)
      .post(R4_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        'hub.mode': 'subscribe',
        'hub.topic': 'topic',
        'hub.events': 'Patient-open',
      });

    expect(res.status).toBe(400);
  });

  test('Subscribe invalid hub.channel.type', async () => {
    const res = await request(server)
      .post(R4_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        'hub.channel.type': 'webhook',
        'hub.mode': 'subscribe',
        'hub.topic': 'topic',
        'hub.events': 'Patient-open',
      });

    expect(res.status).toBe(400);
  });

  test('Subscribe invalid hub.mode', async () => {
    const res = await request(server)
      .post(R4_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        'hub.channel.type': 'websocket',
        'hub.mode': 'xyz',
        'hub.topic': 'topic',
        'hub.events': 'Patient-open',
      });

    expect(res.status).toBe(400);
  });

  test('Subscribe missing hub.topic', async () => {
    const res = await request(server)
      .post(R4_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        'hub.channel.type': 'websocket',
        'hub.mode': 'subscribe',
        'hub.events': 'Patient-open',
      });

    expect(res.status).toBe(400);
  });

  // ==========================================================================
  // Subscribing twice yields same endpoint
  // ==========================================================================

  test('Subscribing twice to the same topic yields same endpoint', async () => {
    const topic = randomUUID();

    const res1 = await request(server)
      .post(R4_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        'hub.channel.type': 'websocket',
        'hub.mode': 'subscribe',
        'hub.topic': topic,
        'hub.events': 'Patient-open',
      });

    const res2 = await request(server)
      .post(R4_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        'hub.channel.type': 'websocket',
        'hub.mode': 'subscribe',
        'hub.topic': topic,
        'hub.events': 'Patient-open',
      });

    expect(res1.status).toBe(202);
    expect(res2.status).toBe(202);
    expect(res1.body['hub.channel.endpoint']).toBe(res2.body['hub.channel.endpoint']);
  });

  // ==========================================================================
  // GetCurrentContext
  // ==========================================================================

  test('GetCurrentContext with no context returns empty', async () => {
    const topic = randomUUID();

    const res = await request(server)
      .get(`${R4_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + accessToken);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      'context.type': '',
      context: [],
    });
  });

  // ==========================================================================
  // Context change - Patient-open
  // ==========================================================================

  test('Patient-open context change', async () => {
    const topic = randomUUID();
    const patientId = randomUUID();

    // Subscribe first
    await request(server)
      .post(R4_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        'hub.channel.type': 'websocket',
        'hub.mode': 'subscribe',
        'hub.topic': topic,
        'hub.events': 'Patient-open',
      });

    // Send context change
    const res = await request(server)
      .post(R4_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        timestamp: new Date().toISOString(),
        id: randomUUID(),
        event: {
          'hub.topic': topic,
          'hub.event': 'Patient-open',
          context: [
            {
              key: 'patient',
              resource: { resourceType: 'Patient', id: patientId },
            },
          ],
        },
      });

    expect(res.status).toBe(202);

    // Verify context was set
    const contextRes = await request(server)
      .get(`${R4_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + accessToken);

    expect(contextRes.status).toBe(200);
    expect(contextRes.body['context.type']).toBe('Patient');
    expect(contextRes.body['context.versionId']).toBeDefined();
    expect(contextRes.body.context).toHaveLength(1);
  });

  // ==========================================================================
  // Context change via /:topic route
  // ==========================================================================

  test('Context change via /:topic route', async () => {
    const topic = randomUUID();
    const patientId = randomUUID();

    const res = await request(server)
      .post(`${R4_BASE_ROUTE}/${topic}`)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        timestamp: new Date().toISOString(),
        id: randomUUID(),
        event: {
          'hub.topic': topic,
          'hub.event': 'Patient-open',
          context: [
            {
              key: 'patient',
              resource: { resourceType: 'Patient', id: patientId },
            },
          ],
        },
      });

    expect(res.status).toBe(202);
  });

  // ==========================================================================
  // DiagnosticReport lifecycle
  // ==========================================================================

  test('DiagnosticReport open creates content bundle', async () => {
    const topic = randomUUID();
    const reportId = randomUUID();
    const patientId = randomUUID();

    // Open DiagnosticReport
    const res = await request(server)
      .post(`${R4_BASE_ROUTE}/${topic}`)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        timestamp: new Date().toISOString(),
        id: randomUUID(),
        event: {
          'hub.topic': topic,
          'hub.event': 'DiagnosticReport-open',
          context: [
            {
              key: 'report',
              resource: { resourceType: 'DiagnosticReport', id: reportId, status: 'preliminary', code: {} },
            },
            {
              key: 'patient',
              resource: { resourceType: 'Patient', id: patientId },
            },
          ],
        },
      });

    expect(res.status).toBe(202);

    // Verify context includes content bundle
    const contextRes = await request(server)
      .get(`${R4_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + accessToken);

    expect(contextRes.status).toBe(200);
    expect(contextRes.body['context.type']).toBe('DiagnosticReport');
    expect(contextRes.body['context.versionId']).toBeDefined();

    const content = contextRes.body.context.find((c: any) => c.key === 'content');
    expect(content).toBeDefined();
    expect(content.resource.resourceType).toBe('Bundle');
    expect(content.resource.type).toBe('collection');
  });

  test('DiagnosticReport-update with version mismatch returns 400', async () => {
    const topic = randomUUID();
    const reportId = randomUUID();
    const patientId = randomUUID();

    // Open DiagnosticReport
    await request(server)
      .post(`${R4_BASE_ROUTE}/${topic}`)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        timestamp: new Date().toISOString(),
        id: randomUUID(),
        event: {
          'hub.topic': topic,
          'hub.event': 'DiagnosticReport-open',
          context: [
            {
              key: 'report',
              resource: { resourceType: 'DiagnosticReport', id: reportId, status: 'preliminary', code: {} },
            },
            {
              key: 'patient',
              resource: { resourceType: 'Patient', id: patientId },
            },
          ],
        },
      });

    // Try update with wrong version ID
    const res = await request(server)
      .post(`${R4_BASE_ROUTE}/${topic}`)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        timestamp: new Date().toISOString(),
        id: randomUUID(),
        event: {
          'hub.topic': topic,
          'hub.event': 'DiagnosticReport-update',
          'context.versionId': 'wrong-version',
          context: [
            {
              key: 'report',
              reference: { reference: `DiagnosticReport/${reportId}` },
            },
            {
              key: 'updates',
              resource: {
                resourceType: 'Bundle',
                type: 'transaction',
                entry: [],
              },
            },
          ],
        },
      });

    expect(res.status).toBe(400);
  });

  test('DiagnosticReport close clears context', async () => {
    const topic = randomUUID();
    const reportId = randomUUID();
    const patientId = randomUUID();

    // Open
    await request(server)
      .post(`${R4_BASE_ROUTE}/${topic}`)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        timestamp: new Date().toISOString(),
        id: randomUUID(),
        event: {
          'hub.topic': topic,
          'hub.event': 'DiagnosticReport-open',
          context: [
            {
              key: 'report',
              resource: { resourceType: 'DiagnosticReport', id: reportId, status: 'preliminary', code: {} },
            },
            {
              key: 'patient',
              resource: { resourceType: 'Patient', id: patientId },
            },
          ],
        },
      });

    // Close
    await request(server)
      .post(`${R4_BASE_ROUTE}/${topic}`)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        timestamp: new Date().toISOString(),
        id: randomUUID(),
        event: {
          'hub.topic': topic,
          'hub.event': 'DiagnosticReport-close',
          context: [
            {
              key: 'report',
              resource: { resourceType: 'DiagnosticReport', id: reportId, status: 'preliminary', code: {} },
            },
            {
              key: 'patient',
              resource: { resourceType: 'Patient', id: patientId },
            },
          ],
        },
      });

    // Verify empty context
    const contextRes = await request(server)
      .get(`${R4_BASE_ROUTE}/${topic}`)
      .set('Authorization', 'Bearer ' + accessToken);

    expect(contextRes.status).toBe(200);
    expect(contextRes.body).toMatchObject({
      'context.type': '',
      context: [],
    });
  });

  // ==========================================================================
  // Invalid context change request
  // ==========================================================================

  test('Context change with missing event returns 400', async () => {
    const res = await request(server)
      .post(R4_BASE_ROUTE)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        timestamp: new Date().toISOString(),
        id: randomUUID(),
        // missing event
      });

    expect(res.status).toBe(400);
  });
});

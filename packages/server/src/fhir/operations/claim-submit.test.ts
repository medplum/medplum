// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Claim } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';

const app = express();
const minimalClaim: Claim = {
  resourceType: 'Claim',
  status: 'active',
  type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claim-type', code: 'professional' }] },
  use: 'claim',
  patient: { reference: 'Patient/example' },
  created: '2026-01-01T00:00:00.000Z',
  provider: { reference: 'Practitioner/example' },
  priority: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/processpriority', code: 'normal' }] },
  insurance: [
    {
      sequence: 1,
      focal: true,
      coverage: { reference: 'Coverage/example' },
    },
  ],
};

function bodyWith(processor: string | undefined, resource: Claim = minimalClaim): object {
  const parameter: { name: string; valueCode?: string; resource?: Claim }[] = [{ name: 'resource', resource }];
  if (processor !== undefined) {
    parameter.unshift({ name: 'processor', valueCode: processor });
  }
  return { resourceType: 'Parameters', parameter };
}

describe('Claim $submit dispatcher', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Rejects invalid processor value', async () => {
    const accessToken = await initTestAuth({
      project: {
        secret: [{ name: 'STEDI_CLAIM_API_KEY', valueString: 'stedi-test-key' }],
      },
    });
    const res = await request(app)
      .post('/fhir/R4/Claim/$submit')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send(bodyWith('foo'));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/Invalid processor/i);
  });

  test('Returns 400 when no processor secrets are configured', async () => {
    const accessToken = await initTestAuth();
    const res = await request(app)
      .post('/fhir/R4/Claim/$submit')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send(bodyWith(undefined));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/No claim processor configured/i);
  });

  test('Returns 400 when processor=stedi in body but STEDI_CLAIM_API_KEY not configured', async () => {
    const accessToken = await initTestAuth({
      project: {
        secret: [{ name: 'CANDID_SECRET_ID', valueString: 'candid-test-secret' }],
      },
    });
    const res = await request(app)
      .post('/fhir/R4/Claim/$submit')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send(bodyWith('stedi'));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/No claim processor configured/i);
  });

  test('Returns 400 when processor=candid in body but CANDID_SECRET_ID not configured', async () => {
    const accessToken = await initTestAuth({
      project: {
        secret: [{ name: 'STEDI_CLAIM_API_KEY', valueString: 'stedi-test-key' }],
      },
    });
    const res = await request(app)
      .post('/fhir/R4/Claim/$submit')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send(bodyWith('candid'));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/No claim processor configured/i);
  });

  test('Routes to stedi when processor=stedi in body and STEDI_CLAIM_API_KEY configured', async () => {
    const accessToken = await initTestAuth({
      project: {
        secret: [{ name: 'STEDI_CLAIM_API_KEY', valueString: 'stedi-test-key' }],
      },
    });
    const res = await request(app)
      .post('/fhir/R4/Claim/$submit')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send(bodyWith('stedi'));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/stedi-submit-claim/);
  });

  test('Routes to candid when processor=CANDID in body (case-insensitive)', async () => {
    const accessToken = await initTestAuth({
      project: {
        secret: [{ name: 'CANDID_SECRET_ID', valueString: 'candid-test-secret' }],
      },
    });
    const res = await request(app)
      .post('/fhir/R4/Claim/$submit')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send(bodyWith('CANDID'));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/candid-submit-claim/);
  });

  test('Falls back to STEDI_CLAIM_API_KEY secret when processor not in body', async () => {
    const accessToken = await initTestAuth({
      project: {
        secret: [{ name: 'STEDI_CLAIM_API_KEY', valueString: 'stedi-test-key' }],
      },
    });
    const res = await request(app)
      .post('/fhir/R4/Claim/$submit')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send(bodyWith(undefined));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/stedi-submit-claim/);
  });

  test('Falls back to CANDID_SECRET_ID secret when processor not in body', async () => {
    const accessToken = await initTestAuth({
      project: {
        secret: [{ name: 'CANDID_SECRET_ID', valueString: 'candid-test-secret' }],
      },
    });
    const res = await request(app)
      .post('/fhir/R4/Claim/$submit')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send(bodyWith(undefined));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/candid-submit-claim/);
  });

  test('Body processor overrides project secrets when both are configured', async () => {
    const accessToken = await initTestAuth({
      project: {
        secret: [
          { name: 'STEDI_CLAIM_API_KEY', valueString: 'stedi-test-key' },
          { name: 'CANDID_SECRET_ID', valueString: 'candid-test-secret' },
        ],
      },
    });
    const res = await request(app)
      .post('/fhir/R4/Claim/$submit')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send(bodyWith('candid'));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/candid-submit-claim/);
    expect(JSON.stringify(res.body)).not.toMatch(/stedi-submit-claim/);
  });

  test('Returns 400 when no Claim payload provided and processor secret configured', async () => {
    const accessToken = await initTestAuth({
      project: {
        secret: [{ name: 'STEDI_CLAIM_API_KEY', valueString: 'stedi-test-key' }],
      },
    });
    const res = await request(app)
      .post('/fhir/R4/Claim/$submit')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'processor', valueCode: 'stedi' }],
      });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/Missing Claim payload/i);
  });
});

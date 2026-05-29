// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import type { Bundle, Parameters, Patient } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';

const app = express();
let accessToken: string;

describe('SMART Health operations', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Generate and verify SMART Health Card', async () => {
    const patient = await createPatient();

    const generateResponse = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$generate-smart-health-card`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ includeQrCode: true });
    expect(generateResponse.status).toBe(200);

    const credential = getStringParameter(generateResponse.body, 'credential');
    expect(credential.split('.')).toHaveLength(3);
    expect(getStringParameter(generateResponse.body, 'shcUri')).toMatch(/^shc:\//);
    expect(getStringParameter(generateResponse.body, 'file')).toContain('verifiableCredential');
    expect(getStringParameter(generateResponse.body, 'qrCodeDataUrl')).toMatch(/^data:image\/png;base64,/);

    const verifyResponse = await request(app)
      .post('/fhir/R4/$verify-smart-health-card')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ credential });
    expect(verifyResponse.status).toBe(200);
    expect(getBooleanParameter(verifyResponse.body, 'valid')).toBe(true);

    const bundle = JSON.parse(getStringParameter(verifyResponse.body, 'fhirBundle')) as Bundle;
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.entry?.some((entry) => entry.resource?.resourceType === 'Patient')).toBe(true);
  });

  test('Generate manifest and resolve SMART Health Link', async () => {
    const patient = await createPatient();

    const generateResponse = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$generate-smart-health-link`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ passcode: '123456', label: 'Test Link' });
    expect(generateResponse.status).toBe(200);

    const shlink = getStringParameter(generateResponse.body, 'shlink');
    expect(shlink).toMatch(/^shlink:\//);

    const manifestUrl = new URL(getStringParameter(generateResponse.body, 'manifestUrl'));
    const manifestResponse = await request(app)
      .post(manifestUrl.pathname)
      .set('Content-Type', ContentType.JSON)
      .send({ recipient: 'Test Recipient', passcode: '123456' });
    expect(manifestResponse.status).toBe(200);
    expect(manifestResponse.body.files).toHaveLength(1);
    expect(manifestResponse.body.files[0].embedded).toBeDefined();

    const resolveResponse = await request(app)
      .post('/fhir/R4/$resolve-smart-health-link')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({ shlink, recipient: 'Test Recipient', passcode: '123456' });
    expect(resolveResponse.status).toBe(200);
    expect(getBooleanParameter(resolveResponse.body, 'valid')).toBe(true);

    const fhirResources = JSON.parse(getStringParameter(resolveResponse.body, 'fhirResources')) as Bundle[];
    expect(fhirResources[0]?.resourceType).toBe('Bundle');
  });
});

async function createPatient(): Promise<Patient> {
  const response = await request(app)
    .post('/fhir/R4/Patient')
    .set('Authorization', 'Bearer ' + accessToken)
    .set('Content-Type', ContentType.FHIR_JSON)
    .send({ resourceType: 'Patient', name: [{ given: ['Alice'], family: 'Smith' }] });
  expect(response.status).toBe(201);
  return response.body as Patient;
}

function getStringParameter(parameters: Parameters, name: string): string {
  const value = parameters.parameter?.find((p) => p.name === name)?.valueString;
  expect(value).toBeDefined();
  return value as string;
}

function getBooleanParameter(parameters: Parameters, name: string): boolean {
  const value = parameters.parameter?.find((p) => p.name === name)?.valueBoolean;
  expect(value).toBeDefined();
  return value as boolean;
}

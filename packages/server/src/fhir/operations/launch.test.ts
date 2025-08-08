// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import { ClientApplication, Encounter, Patient, SmartAppLaunch } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { createTestProject, withTestContext } from '../../test.setup';
import { Repository } from '../repo';

const app = express();

describe('ClientApplication/:id/$smart-launch', () => {
  let accessToken: string;
  let client: ClientApplication;
  let repo: Repository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await withTestContext(() => initApp(app, config));

    ({ client, accessToken, repo } = await createTestProject({
      withClient: true,
      withAccessToken: true,
      withRepo: true,
    }));
  });

  beforeEach(async () => {
    expect(accessToken).toBeDefined();
    expect(client.id).toBeDefined();
    expect(repo).toBeInstanceOf(Repository);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Requires ID', async () => {
    const res = await request(app)
      .get('/fhir/R4/ClientApplication/$smart-launch')
      .set('Authorization', 'Bearer ' + accessToken)
      .send();
    expect(res.status).toBe(404);
  });

  test('Requires launchUri to be configured', async () => {
    const res = await request(app)
      .get(`/fhir/R4/ClientApplication/${client.id}/$smart-launch`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send();
    expect(res.status).toBe(400);
  });

  test('Redirects to launchUri', async () => {
    // Update ClientApplication with launchUri
    const launchUri = 'https://example.com/smart-launch';
    client = await repo.updateResource({ ...client, launchUri });

    const res = await request(app)
      .get(`/fhir/R4/ClientApplication/${client.id}/$smart-launch`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send();
    expect(res.status).toBe(302);
    expect(res.headers['location'].startsWith(launchUri + '?')).toBe(true);

    const uri = new URL(res.headers['location']);
    const launchId = uri.searchParams.get('launch');

    // Ensure resource exists
    const launch = await repo.readResource<SmartAppLaunch>('SmartAppLaunch', launchId as string);
    expect(launch.id).toEqual(launchId);
  });

  test('Preserves launch parameter', async () => {
    // Update ClientApplication with launchUri
    const launchUri = 'https://example.com/smart-launch';
    client = await repo.updateResource({ ...client, launchUri });

    const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });

    const res = await request(app)
      .get(`/fhir/R4/ClientApplication/${client.id}/$smart-launch`)
      .set('Authorization', 'Bearer ' + accessToken)
      .query({ patient: patient.id })
      .send();
    expect(res.status).toBe(302);
    expect(res.headers['location'].startsWith(launchUri + '?')).toBe(true);

    const uri = new URL(res.headers['location']);
    const launchId = uri.searchParams.get('launch');

    // Ensure resource contains launch context
    const launch = await repo.readResource<SmartAppLaunch>('SmartAppLaunch', launchId as string);
    expect(launch.patient).toStrictEqual(createReference(patient));
  });

  test('Requires single launch parameter', async () => {
    // Update ClientApplication with launchUri
    const launchUri = 'https://example.com/smart-launch';
    client = await repo.updateResource({ ...client, launchUri });

    const patient = await repo.createResource<Patient>({ resourceType: 'Patient' });
    const encounter = await repo.createResource<Encounter>({
      resourceType: 'Encounter',
      status: 'unknown',
      class: { display: 'Appointment' },
    });

    const res = await request(app)
      .get(`/fhir/R4/ClientApplication/${client.id}/$smart-launch`)
      .set('Authorization', 'Bearer ' + accessToken)
      .query({ patient: patient.id, encounter: encounter.id })
      .send();
    expect(res.status).toBe(400);
  });
});

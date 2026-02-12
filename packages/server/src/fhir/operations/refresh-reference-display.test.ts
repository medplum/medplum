// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { AccessPolicy, ClientApplication, Observation, Patient, Practitioner } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { createTestProject, withTestContext } from '../../test.setup';
import type { Repository } from '../repo';
import { getSystemRepo } from '../repo';

describe('$refresh-reference-display', () => {
  const app = express();
  let repo: Repository;
  let accessToken: string;
  let client: WithId<ClientApplication>;
  let accessPolicy: WithId<AccessPolicy>;
  let systemRepo: Repository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    systemRepo = getSystemRepo();
    ({ repo, accessToken, client, accessPolicy } = await createTestProject({
      withAccessToken: true,
      withRepo: true,
      withClient: true,
      project: { name: 'Named Test Project' },
      membership: { admin: true },
      accessPolicy: {
        resource: [
          { resourceType: 'Patient' },
          { resourceType: 'Practitioner' },
          { resourceType: 'Observation' },
          { resourceType: 'ClientApplication' },
        ],
      },
    }));
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Updates all reference display strings in resource', () =>
    withTestContext(async () => {
      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Test', 'Patient'], family: 'Jones' }],
      });
      const practitionerA = await repo.createResource<Practitioner>({
        resourceType: 'Practitioner',
        name: [{ text: 'Practitioner å' }],
      });
      const practitionerB = await repo.createResource<Practitioner>({
        resourceType: 'Practitioner',
        name: [{ given: ['Practitioner'], family: '∫' }],
      });

      const observation = await repo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'Test Observation' },
        subject: createReference(patient),
        performer: [createReference(practitionerA), createReference(practitionerB)],
      });
      expect(observation.meta?.author?.display).toBe(client.name);
      expect(observation.subject?.display).toBe('Test Patient Jones');
      expect(observation.performer?.map((p) => p.display)).toStrictEqual(['Practitioner å', 'Practitioner ∫']);

      // Update referenced resource names
      await repo.updateResource({ ...patient, name: [{ text: 'Test Patient Jones-Smith' }] });
      await repo.updateResource({ ...practitionerA, name: [{ text: 'Practitioner ∞' }] });
      await repo.updateResource({ ...practitionerB, name: [{ text: 'Practitioner ß' }] });
      await repo.updateResource({ ...client, name: 'Client!' });

      // Invoke operation to update display strings in Observation
      const res = await request(app)
        .post(`/fhir/R4/Observation/${observation.id}/$refresh-reference-display`)
        .auth(accessToken, { type: 'bearer' })
        .set('X-Medplum', 'extended')
        .send();
      expect(res.status).toBe(200);
      const updated = res.body as Observation;

      expect(updated.meta?.author?.display).toBe('Client!');
      expect(updated.subject?.display).toBe('Test Patient Jones-Smith');
      expect(updated.performer?.map((p) => p.display)).toStrictEqual(['Practitioner ∞', 'Practitioner ß']);
    }));

  test('Does not change strings for resources user cannot access', () =>
    withTestContext(async () => {
      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Test', 'Patient'], family: 'Jones' }],
      });
      const practitioner = await repo.createResource<Practitioner>({
        resourceType: 'Practitioner',
        name: [{ text: 'Practitioner I' }],
      });
      const observation = await repo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'Test Observation' },
        subject: createReference(patient),
        performer: [createReference(practitioner)],
      });

      // Update referenced resource names
      await repo.updateResource({ ...patient, name: [{ text: 'Test Patient Jones-Smith' }] });
      await repo.updateResource({ ...practitioner, name: [{ text: 'Practitioner ∞' }] });

      await systemRepo.updateResource({
        ...accessPolicy,
        resource: [{ resourceType: 'Patient' }, { resourceType: 'Observation' }],
      });

      // Invoke operation with restricted access policy
      const res = await request(app)
        .post(`/fhir/R4/Observation/${observation.id}/$refresh-reference-display`)
        .auth(accessToken, { type: 'bearer' })
        .set('X-Medplum', 'extended')
        .send();
      expect(res.status).toBe(200);
      const updated = res.body as Observation;

      expect(updated.subject?.display).toBe('Test Patient Jones-Smith');
      expect(updated.performer?.map((p) => p.display)).toStrictEqual(['Practitioner I']);
    }));
});

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { parseSearchRequest } from '@medplum/core';
import type { Encounter, Observation, Patient } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { createTestProject, withTestContext } from '../test.setup';
import { getGlobalSystemRepo, Repository } from './repo';

/**
 * Chained search builds an EXISTS() subquery over the reference lookup tables. Each link
 * target in that subquery must be filtered by project and access policy just like the outer
 * query filters its own resource type, so that a chain only ever traverses resources the
 * caller can read. Reference values are indexed as plain strings, so a reference can point
 * at a resource that is not visible to the repository holding it.
 */
describe('Chained search filters', () => {
  let projectARepo: Repository;
  let projectBRepo: Repository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);

    projectARepo = (await createTestProject({ withRepo: true })).repo;
    projectBRepo = (await createTestProject({ withRepo: true })).repo;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('forward chain does not match a target in another project', () =>
    withTestContext(async () => {
      const family = randomUUID();
      const patientA = await projectARepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ family, given: ['Victoria'] }],
        birthDate: '1985-04-12',
      });

      const code = randomUUID();
      const observationB = await projectBRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ code }] },
        subject: { reference: `Patient/${patientA.id}` },
      });

      // The Observation itself is visible within its own project...
      const ownResult = await projectBRepo.search(parseSearchRequest(`Observation?code=${code}`));
      expect(ownResult.entry?.map((e) => e.resource?.id)).toStrictEqual([observationB.id]);

      // ...but no chained filter on the out-of-project target may match, for any field or
      // partial value.
      for (const query of [
        `Observation?code=${code}&subject:Patient.name=${family}`,
        `Observation?code=${code}&subject:Patient.name=${family.slice(0, 6)}`,
        `Observation?code=${code}&subject:Patient.birthdate=1985-04-12`,
        `Observation?code=${code}&subject:Patient.given=Victoria`,
      ]) {
        const result = await projectBRepo.search(parseSearchRequest(query));
        expect(result.entry ?? []).toHaveLength(0);
      }
    }));

  test('reverse chain does not match a referring resource in another project', () =>
    withTestContext(async () => {
      // Here the reference is written by the other project: project B owns the Patient and
      // project A owns the Observation pointing at it.
      const patientB = await projectBRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ family: randomUUID() }],
      });
      const codeA = randomUUID();
      await projectARepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ code: codeA }] },
        subject: { reference: `Patient/${patientB.id}` },
      });

      const result = await projectBRepo.search(
        parseSearchRequest(`Patient?_id=${patientB.id}&_has:Observation:subject:code=${codeA}`)
      );
      expect(result.entry ?? []).toHaveLength(0);
    }));

  test('intermediate chain links are filtered, not just the terminal link', () =>
    withTestContext(async () => {
      // Chain: Patient <-(subject)- Observation -(encounter)-> Encounter
      // Project B owns both ends; only the middle Observation belongs to project A.
      const patientB = await projectBRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ family: randomUUID() }],
      });
      const encounterCode = randomUUID();
      const encounterB = await projectBRepo.createResource<Encounter>({
        resourceType: 'Encounter',
        status: 'finished',
        class: { code: encounterCode },
      });
      await projectARepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ code: randomUUID() }] },
        subject: { reference: `Patient/${patientB.id}` },
        encounter: { reference: `Encounter/${encounterB.id}` },
      });

      const result = await projectBRepo.search(
        parseSearchRequest(
          `Patient?_id=${patientB.id}&_has:Observation:subject:encounter:Encounter.class=${encounterCode}`
        )
      );
      expect(result.entry ?? []).toHaveLength(0);
    }));

  test('chain respects access policy criteria on the chain target', () =>
    withTestContext(async () => {
      const family = randomUUID();
      const { project, repo: limitedRepo } = await createTestProject({
        withRepo: true,
        accessPolicy: {
          resource: [{ resourceType: 'Patient', criteria: 'Patient?active=true' }, { resourceType: 'Observation' }],
        },
      });

      // Seed both Patients through the system repo so they land in the same project as
      // limitedRepo without being subject to its access policy on write.
      const systemRepo = getGlobalSystemRepo();
      const excludedPatient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        meta: { project: project.id },
        name: [{ family }],
        active: false,
      });
      const includedPatient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        meta: { project: project.id },
        name: [{ family }],
        active: true,
      });

      const excludedCode = randomUUID();
      await limitedRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ code: excludedCode }] },
        subject: { reference: `Patient/${excludedPatient.id}` },
      });
      const includedCode = randomUUID();
      const includedObservation = await limitedRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ code: includedCode }] },
        subject: { reference: `Patient/${includedPatient.id}` },
      });

      // The criteria exclude the inactive Patient, so the chain must not match it.
      const excludedResult = await limitedRepo.search(
        parseSearchRequest(`Observation?code=${excludedCode}&subject:Patient.name=${family}`)
      );
      expect(excludedResult.entry ?? []).toHaveLength(0);

      // The same chain still works for a Patient the criteria include.
      const includedResult = await limitedRepo.search(
        parseSearchRequest(`Observation?code=${includedCode}&subject:Patient.name=${family}`)
      );
      expect(includedResult.entry?.map((e) => e.resource?.id)).toStrictEqual([includedObservation.id]);
    }));

  test('access policy criteria that chain in a cycle are bounded', () =>
    withTestContext(async () => {
      // Filtering a chain link recurses when that link's own access policy criteria contain a
      // chained search, so a cycle between two criteria would otherwise recurse until the
      // stack overflows. Invariant axp-3 rejects such criteria on write, but rows stored
      // before it existed are read back without revalidation.
      const { project } = await createTestProject();
      const repo = new Repository({
        strictMode: true,
        projects: [project],
        author: { reference: 'User/' + randomUUID() },
        accessPolicy: {
          resourceType: 'AccessPolicy',
          resource: [
            { resourceType: 'Patient', criteria: 'Patient?_has:Observation:subject:status=final' },
            { resourceType: 'Observation', criteria: 'Observation?subject:Patient.active=true' },
          ],
        },
      });

      await expect(repo.search(parseSearchRequest('Patient?name=nobody'))).rejects.toThrow(
        'Access policy criteria are nested too deeply'
      );
    }));

  test('chained search still matches within a single project', () =>
    withTestContext(async () => {
      const family = randomUUID();
      const patient = await projectARepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ family }],
        birthDate: '1990-06-07',
      });
      const code = randomUUID();
      const observation = await projectARepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { coding: [{ code }] },
        subject: { reference: `Patient/${patient.id}` },
      });

      const forward = await projectARepo.search(
        parseSearchRequest(`Observation?code=${code}&subject:Patient.name=${family}`)
      );
      expect(forward.entry?.map((e) => e.resource?.id)).toStrictEqual([observation.id]);

      const byBirthDate = await projectARepo.search(
        parseSearchRequest(`Observation?code=${code}&subject:Patient.birthdate=1990-06-07`)
      );
      expect(byBirthDate.entry?.map((e) => e.resource?.id)).toStrictEqual([observation.id]);

      const reverse = await projectARepo.search(parseSearchRequest(`Patient?_has:Observation:subject:code=${code}`));
      expect(reverse.entry?.map((e) => e.resource?.id)).toStrictEqual([patient.id]);
    }));
});

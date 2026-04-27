// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { ElementDefinition, Observation, Patient, StructureDefinition, ValueSet } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import assert from 'node:assert';
import { resolve } from 'path';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { createTestProject, withTestContext } from '../../test.setup';
import type { Repository } from '../repo';
import { getGlobalSystemRepo } from '../repo';

jest.mock('hibp');

describe('Repository validation', () => {
  const systemRepo = getGlobalSystemRepo();
  const rawUsCorePatientProfile = readFileSync(resolve(__dirname, '../__test__/us-core-patient.json'), 'utf8');
  const usCorePatientProfile = JSON.parse(rawUsCorePatientProfile) as StructureDefinition;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Profile validation', async () =>
    withTestContext(async () => {
      const { repo } = await createTestProject({ withRepo: true });

      const profile = { ...usCorePatientProfile, url: 'urn:uuid:' + randomUUID() };
      const patient: Patient = {
        resourceType: 'Patient',
        meta: {
          profile: [profile.url],
        },
        identifier: [
          {
            system: 'http://example.com/patient-id',
            value: 'foo',
          },
        ],
        name: [
          {
            given: ['Alex'],
            family: 'Baker',
          },
        ],
        // Missing gender property is required by profile
      };

      await expect(repo.createResource(patient)).resolves.toBeTruthy();
      await repo.createResource(profile);
      await expect(repo.createResource(patient)).rejects.toThrow(
        new Error('Missing required property (Patient.gender)')
      );
    }));

  test('Profile update', async () =>
    withTestContext(async () => {
      const { repo } = await createTestProject({ withRepo: true });

      const profile = await repo.createResource({
        ...usCorePatientProfile,
        url: 'urn:uuid:' + randomUUID(),
      });

      const patient: Patient = {
        resourceType: 'Patient',
        meta: { profile: [profile.url] },
        identifier: [{ system: 'http://example.com/patient-id', value: 'foo' }],
        name: [{ given: ['Alex'], family: 'Baker' }],
        gender: 'male',
      };

      // Create the patient
      // This should succeed
      await expect(repo.createResource(patient)).resolves.toBeTruthy();

      // Now update the profile to make "address" a required field
      await repo.updateResource<StructureDefinition>({
        ...profile,
        snapshot: {
          ...profile.snapshot,
          element: profile.snapshot?.element?.map((e) => {
            if (e.path === 'Patient.address') {
              return {
                ...e,
                min: 1,
              };
            }
            return e;
          }) as ElementDefinition[],
        },
      });

      // Now try to create another patient without an address
      // This should fail
      await expect(repo.createResource(patient)).rejects.toThrow(
        new Error('Missing required property (Patient.address)')
      );
    }));

  describe('Update resource with terminology validation', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      identifier: [{ use: 'usual', system: 'urn:oid:1.2.36.146.595.217.0.1', value: '12345' }],
      active: true,
      name: [
        { use: 'official', family: 'Chalmers', given: ['Peter', 'James'] },
        { use: 'usual', given: ['Jim'] },
        { use: 'maiden', family: 'Windsor', given: ['Peter', 'James'] },
      ],
      telecom: [
        { use: 'home', system: 'url', value: 'http://example.com' },
        { system: 'phone', value: '(03) 5555 6473', use: 'work', rank: 1 },
        { system: 'phone', value: '(03) 3410 5613', use: 'mobile', rank: 2 },
        { system: 'phone', value: '(03) 5555 8834', use: 'old' },
      ],
      gender: 'male',
      birthDate: '1974-12-25',
      address: [{ use: 'home', type: 'both', text: '534 Erewhon St PeasantVille, Rainbow, Vic  3999' }],
      contact: [
        {
          name: { use: 'usual', family: 'du Marché', given: ['Bénédicte'] },
          telecom: [{ system: 'phone', value: '+33 (237) 998327', use: 'home' }],
          address: { use: 'home', type: 'both', line: ['534 Erewhon St'], city: 'PleasantVille', postalCode: '3999' },
          gender: 'female',
        },
      ],
      communication: [{ language: { coding: [{ system: 'urn:ietf:bcp:47', code: 'en' }] } }],
    };

    let repo: Repository;
    let profile: StructureDefinition;
    beforeAll(async () => {
      const result = await createTestProject({ withRepo: true, project: { features: ['validate-terminology'] } });
      repo = result.repo;

      // Create modified US Core Patient profile to have 'required' binding for communication.language
      const modifiedPatientProfile = JSON.parse(rawUsCorePatientProfile) as StructureDefinition;

      const commLang = modifiedPatientProfile.snapshot?.element.find((e) => e.id === 'Patient.communication.language');
      assert(commLang?.binding?.valueSet === 'http://hl7.org/fhir/us/core/ValueSet/simple-language');
      assert(commLang.binding.strength === 'extensible');
      commLang.binding.strength = 'required';

      profile = await repo.createResource({
        ...modifiedPatientProfile,
        url: 'urn:uuid:' + randomUUID(),
      });

      // Create a ValueSet for the US Core Patient profile that includes only 'en' as a valid language
      await repo.createResource<ValueSet>({
        resourceType: 'ValueSet',
        url: 'http://hl7.org/fhir/us/core/ValueSet/simple-language',
        expansion: {
          timestamp: new Date().toISOString(),
          contains: [
            {
              system: 'urn:ietf:bcp:47',
              code: 'en',
            },
          ],
        },
        status: 'active',
      });
    });
    test('Valid patient without any profiles', async () =>
      withTestContext(async () => {
        await expect(repo.createResource(patient)).resolves.toBeDefined();
      }));

    test('Invalid gender', async () =>
      withTestContext(async () => {
        await expect(
          repo.createResource({ ...patient, gender: 'enby' as unknown as Patient['gender'] })
        ).rejects.toThrow(
          `Value "enby" did not satisfy terminology binding http://hl7.org/fhir/ValueSet/administrative-gender|4.0.1 (Patient.gender)`
        );
      }));

    test('Valid patient with US Core Patient profile', async () =>
      withTestContext(async () => {
        await expect(repo.createResource({ ...patient, meta: { profile: [profile.url] } })).resolves.toBeDefined();
      }));

    test('Invalid patient with US Core Patient profile (communication.language not in ValueSet)', async () =>
      withTestContext(async () => {
        await expect(
          repo.createResource({
            ...patient,
            meta: { profile: [profile.url] },
            communication: [{ language: { coding: [{ system: 'urn:ietf:bcp:47', code: 'fr' }] } }],
          })
        ).rejects.toThrow(
          `Value {"coding":[{"system":"urn:ietf:bcp:47","code":"fr"}]} did not satisfy terminology binding http://hl7.org/fhir/us/core/ValueSet/simple-language (Patient.communication[0].language)`
        );
      }));
  });

  test('Project default profiles', async () =>
    withTestContext(async () => {
      const { repo } = await createTestProject({
        withRepo: true,
        project: {
          defaultProfile: [
            { resourceType: 'Observation', profile: ['http://hl7.org/fhir/StructureDefinition/vitalsigns'] },
          ],
        },
      });

      const observation: Observation = {
        resourceType: 'Observation',
        status: 'final',
        category: [
          { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] },
        ],
        code: { text: 'Strep test' },
        effectiveDateTime: '2024-02-13T14:34:56Z',
        valueBoolean: true,
      };

      await expect(systemRepo.createResource(observation)).resolves.toBeDefined();
      await expect(repo.createResource(observation)).rejects.toThrow('Missing required property (Observation.subject)');

      observation.subject = { identifier: { value: randomUUID() } };
      await expect(repo.createResource(observation)).resolves.toMatchObject<Partial<Observation>>({
        meta: expect.objectContaining({
          profile: ['http://hl7.org/fhir/StructureDefinition/vitalsigns'],
        }),
      });
    }));
});

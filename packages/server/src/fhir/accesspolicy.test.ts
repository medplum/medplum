// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  createReference,
  encodeBase64,
  getReferenceString,
  LOINC,
  normalizeErrorString,
  Operator,
  parseSearchRequest,
  WithId,
} from '@medplum/core';
import {
  AccessPolicy,
  AccessPolicyResource,
  Binary,
  ClientApplication,
  Condition,
  Login,
  Observation,
  Organization,
  Patient,
  Practitioner,
  Project,
  ProjectMembership,
  Quantity,
  Questionnaire,
  ServiceRequest,
  StructureDefinition,
  Subscription,
  Task,
  User,
  UserConfiguration,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { inviteUser } from '../admin/invite';
import { initAppServices, shutdownApp } from '../app';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config/loader';
import { addTestUser, createTestProject, withTestContext } from '../test.setup';
import { buildAccessPolicy, getRepoForLogin } from './accesspolicy';
import { getSystemRepo, Repository } from './repo';

describe('AccessPolicy', () => {
  let testProject: WithId<Project>;
  let systemRepo: Repository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  beforeEach(async () => {
    testProject = (await createTestProject()).project;
    systemRepo = getSystemRepo();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Access policy restricting read', () =>
    withTestContext(async () => {
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        birthDate: '1970-01-01',
      });
      expect(patient).toBeDefined();

      // Empty access policy effectively blocks all reads and writes
      const accessPolicy: AccessPolicy = {
        resourceType: 'AccessPolicy',
      };

      const repo2 = new Repository({
        author: {
          reference: 'Practitioner/123',
        },
        accessPolicy,
      });

      await expect(repo2.readResource('Patient', patient.id)).rejects.toThrow('Forbidden');
    }));

  test('Access policy restricting search', () =>
    withTestContext(async () => {
      // Empty access policy effectively blocks all reads and writes
      const accessPolicy: AccessPolicy = {
        resourceType: 'AccessPolicy',
      };

      const repo2 = new Repository({
        author: {
          reference: 'Practitioner/123',
        },
        accessPolicy,
      });

      await expect(repo2.search({ resourceType: 'Patient' })).rejects.toThrow('Forbidden');
    }));

  test('Access policy restricting write', () =>
    withTestContext(async () => {
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        birthDate: '1970-01-01',
      });
      expect(patient).toBeDefined();

      const accessPolicy: AccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          {
            resourceType: 'Patient',
            readonly: true,
          },
        ],
      };

      const repo2 = new Repository({
        author: {
          reference: 'Practitioner/123',
        },
        accessPolicy,
      });

      await expect(repo2.readResource('Patient', patient.id)).resolves.toBeDefined();
      await expect(repo2.updateResource(patient)).rejects.toThrow('Forbidden');
    }));

  test('Access policy restricting write before update', () =>
    withTestContext(async () => {
      const resource = await systemRepo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        intent: 'order',
        subject: { reference: 'Patient/' + randomUUID() },
        code: { text: 'test' },
        status: 'completed',
      });
      expect(resource).toBeDefined();

      const accessPolicy: AccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          {
            resourceType: 'ServiceRequest',
            criteria: 'ServiceRequest?status=active',
          },
          {
            resourceType: 'ServiceRequest',
            criteria: 'ServiceRequest?status=completed',
            readonly: true,
          },
        ],
      };

      const repo2 = new Repository({
        author: {
          reference: 'Practitioner/123',
        },
        accessPolicy,
      });

      await expect(repo2.readResource('ServiceRequest', resource.id)).resolves.toBeDefined();
      await expect(repo2.updateResource(resource)).rejects.toThrow('Forbidden');
    }));

  test('Access policy restricting write after update', () =>
    withTestContext(async () => {
      const resource = await systemRepo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        intent: 'order',
        subject: { reference: 'Patient/' + randomUUID() },
        code: { text: 'test' },
        status: 'active',
      });
      expect(resource).toBeDefined();

      const accessPolicy: AccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          {
            resourceType: 'ServiceRequest',
            criteria: 'ServiceRequest?status=active',
          },
          {
            resourceType: 'ServiceRequest',
            criteria: 'ServiceRequest?status=completed',
            readonly: true,
          },
        ],
      };

      const repo2 = new Repository({
        author: {
          reference: 'Practitioner/123',
        },
        accessPolicy,
      });

      await expect(repo2.readResource('ServiceRequest', resource.id)).resolves.toBeDefined();
      await expect(repo2.updateResource({ ...resource, status: 'completed' })).rejects.toThrow('Forbidden');
    }));

  test('Access policy restricting delete', () =>
    withTestContext(async () => {
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        birthDate: '1970-01-01',
      });
      expect(patient).toBeDefined();

      const accessPolicy: AccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          {
            resourceType: 'Patient',
            readonly: true,
          },
        ],
      };

      const repo2 = new Repository({
        author: {
          reference: 'Practitioner/123',
        },
        accessPolicy,
      });

      await expect(repo2.readResource('Patient', patient.id)).resolves.toBeDefined();
      await expect(repo2.deleteResource('Patient', patient.id)).rejects.toThrow('Forbidden');
    }));

  test('Access policy set compartment', () =>
    withTestContext(async () => {
      const orgId = randomUUID();

      const accessPolicy: AccessPolicy = {
        resourceType: 'AccessPolicy',
        compartment: {
          reference: 'Organization/' + orgId,
        },
        resource: [
          {
            resourceType: 'Patient',
            compartment: {
              reference: 'Organization/' + orgId,
            },
          },
        ],
      };

      const repo = new Repository({
        extendedMode: true,
        author: {
          reference: 'Practitioner/123',
        },
        accessPolicy,
      });

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        birthDate: '1970-01-01',
      });
      expect(patient.meta?.account?.reference).toStrictEqual('Organization/' + orgId);
      expect(patient.meta?.accounts).toHaveLength(1);
      expect(patient.meta?.accounts).toContainEqual({ reference: 'Organization/' + orgId });

      const readPatient = await repo.readResource('Patient', patient.id);
      expect(readPatient.meta?.account?.reference).toStrictEqual('Organization/' + orgId);
      expect(readPatient.meta?.accounts).toHaveLength(1);
      expect(readPatient.meta?.accounts).toContainEqual({ reference: 'Organization/' + orgId });
    }));

  test('Access policy blocks account override', () =>
    withTestContext(async () => {
      // Setup:
      // User has an access policy with account/compartment restriction
      // User tries to override the account
      // That should be blocked

      const orgId = randomUUID();

      const accessPolicy: AccessPolicy = {
        resourceType: 'AccessPolicy',
        compartment: {
          reference: 'Organization/' + orgId,
        },
        resource: [
          {
            resourceType: 'Patient',
            compartment: {
              reference: 'Organization/' + orgId,
            },
          },
        ],
      };

      const repo = new Repository({
        extendedMode: true,
        author: {
          reference: 'Practitioner/123',
        },
        accessPolicy,
      });

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        birthDate: '1970-01-01',
        meta: {
          account: {
            reference: 'Organization/' + randomUUID(), // naughty!
          },
        },
      });
      expect(patient.meta?.account?.reference).toStrictEqual('Organization/' + orgId);
      expect(patient.meta?.accounts).toHaveLength(1);
      expect(patient.meta?.accounts).toContainEqual({ reference: 'Organization/' + orgId });

      const readPatient = await repo.readResource('Patient', patient.id);
      expect(readPatient.meta?.account?.reference).toStrictEqual('Organization/' + orgId);
      expect(readPatient.meta?.accounts).toHaveLength(1);
      expect(readPatient.meta?.accounts).toContainEqual({ reference: 'Organization/' + orgId });
    }));

  test.each<'resource.compartment' | 'resource.criteria'>(['resource.compartment', 'resource.criteria'])(
    'AccessPolicy.%s with compartment for Binary',
    (compartmentsPath) =>
      withTestContext(async () => {
        const orgId = randomUUID();
        const orgRef = 'Organization/' + orgId;
        const binaryResource: AccessPolicyResource = {
          resourceType: 'Binary',
        };
        const accessPolicy: AccessPolicy = {
          resourceType: 'AccessPolicy',
          compartment: {
            reference: orgRef,
          },
          resource: [binaryResource],
        };

        if (compartmentsPath === 'resource.compartment') {
          binaryResource.compartment = {
            reference: orgRef,
          };
        } else {
          binaryResource.criteria = 'Binary?_compartment=' + orgRef;
        }

        const repo = new Repository({
          extendedMode: true,
          accessPolicy,
          author: {
            reference: 'Practitioner/1',
          },
        });

        const binary = await repo.createResource<Binary>({
          resourceType: 'Binary',
          contentType: 'application/pdf',
          data: encodeBase64('test'),
        });
        expect(binary.meta?.account?.reference).toStrictEqual(orgRef);
        expect(binary.meta?.accounts).toContainEqual({ reference: orgRef });
        expect(binary.meta?.accounts).toHaveLength(1);
        expect(binary.meta?.compartment).toContainEqual({ reference: orgRef });
        expect(binary.meta?.compartment).toHaveLength(1);

        const readBinary = await repo.readResource('Binary', binary.id);
        expect(readBinary.meta?.account?.reference).toStrictEqual(orgRef);
        expect(readBinary.meta?.accounts).toContainEqual({ reference: orgRef });
        expect(readBinary.meta?.accounts).toHaveLength(1);
        expect(readBinary.meta?.compartment).toContainEqual({ reference: orgRef });
        expect(readBinary.meta?.compartment).toHaveLength(1);
      })
  );

  test('Merge access policy account override and resource accounts', () =>
    withTestContext(async () => {
      // Setup:
      // User has an access policy with account/compartment restriction
      // User updates resource with sources of account information
      // The two sources of accounts should be merged

      const overrideId = randomUUID();
      const accessPolicy: AccessPolicy = {
        resourceType: 'AccessPolicy',
        compartment: {
          reference: 'Organization/' + overrideId,
        },
        resource: [
          {
            resourceType: 'Observation',
            criteria: 'Observation?_compartment=Organization/' + overrideId,
          },
          {
            resourceType: 'Patient',
          },
        ],
      };

      const repo = new Repository({
        extendedMode: true,
        accessPolicy,
        author: {
          reference: 'Practitioner/1',
        },
      });

      const observation = await repo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'Eye color' },
        valueCodeableConcept: { text: 'Hazel' },
      });
      expect(observation.meta?.account?.reference).toStrictEqual('Organization/' + overrideId);
      expect(observation.meta?.accounts).toContainEqual({ reference: 'Organization/' + overrideId });
      expect(observation.meta?.accounts).toHaveLength(1);
      expect(observation.meta?.compartment).toContainEqual({ reference: 'Organization/' + overrideId });
      expect(observation.meta?.compartment).toHaveLength(1);

      const readObservation = await repo.readResource('Observation', observation.id);
      expect(readObservation.meta?.account?.reference).toStrictEqual('Organization/' + overrideId);
      expect(readObservation.meta?.accounts).toContainEqual({ reference: 'Organization/' + overrideId });
      expect(readObservation.meta?.accounts).toHaveLength(1);
      expect(readObservation.meta?.compartment).toContainEqual({ reference: 'Organization/' + overrideId });
      expect(readObservation.meta?.compartment).toHaveLength(1);

      const adminRepo = new Repository({
        extendedMode: true,
        projectAdmin: true,
        author: {
          reference: 'Practitioner/0',
        },
      });
      const orgReference = { reference: 'Organization/' + randomUUID() };
      const patient = await adminRepo.createResource<Patient>({
        resourceType: 'Patient',
        meta: { accounts: [orgReference] },
      });
      const patientRef = createReference(patient);
      const observation2 = await repo.createResource<Observation>({
        ...observation,
        subject: patientRef,
      });
      expect(observation2.meta?.account?.reference).toStrictEqual('Organization/' + overrideId);
      expect(observation2.meta?.accounts).toContainEqual({ reference: 'Organization/' + overrideId });
      expect(observation2.meta?.accounts).toContainEqual(orgReference);
      expect(observation2.meta?.accounts).toHaveLength(2);
      expect(observation2.meta?.compartment).toContainEqual({ reference: 'Organization/' + overrideId });
      expect(observation2.meta?.compartment).toContainEqual(patientRef);
      expect(observation2.meta?.compartment).toContainEqual(orgReference);
      expect(observation2.meta?.compartment).toHaveLength(3);

      const readObservation2 = await repo.readResource('Observation', observation2.id);
      expect(readObservation2.meta?.account?.reference).toStrictEqual('Organization/' + overrideId);
      expect(readObservation2.meta?.accounts).toContainEqual({ reference: 'Organization/' + overrideId });
      expect(readObservation2.meta?.accounts).toContainEqual(orgReference);
      expect(readObservation2.meta?.accounts).toHaveLength(2);
      expect(readObservation2.meta?.compartment).toContainEqual({ reference: 'Organization/' + overrideId });
      expect(readObservation2.meta?.compartment).toContainEqual(patientRef);
      expect(readObservation2.meta?.compartment).toContainEqual(orgReference);
      expect(readObservation2.meta?.compartment).toHaveLength(3);
    }));

  test('Access policy restrict compartment', () =>
    withTestContext(async () => {
      const org1 = randomUUID();
      const org2 = randomUUID();

      const accessPolicy1: AccessPolicy = {
        resourceType: 'AccessPolicy',
        compartment: {
          reference: 'Organization/' + org1,
        },
        resource: [
          {
            resourceType: 'Patient',
            compartment: {
              reference: 'Organization/' + org1,
            },
          },
        ],
      };

      const accessPolicy2: AccessPolicy = {
        resourceType: 'AccessPolicy',
        compartment: {
          reference: 'Organization/' + org2,
        },
        resource: [
          {
            resourceType: 'Patient',
            compartment: {
              reference: 'Organization/' + org2,
            },
          },
        ],
      };

      const repo1 = new Repository({
        extendedMode: true,
        author: {
          reference: 'Practitioner/123',
        },
        accessPolicy: accessPolicy1,
      });

      const repo2 = new Repository({
        extendedMode: true,
        author: {
          reference: 'Practitioner/123',
        },
        accessPolicy: accessPolicy2,
      });

      const patient1 = await repo1.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        birthDate: '1970-01-01',
      });
      expect(patient1).toBeDefined();
      expect(patient1.meta?.account).toBeDefined();
      expect(patient1.meta?.account?.reference).toStrictEqual('Organization/' + org1);

      const readPatient1 = await repo1.readResource('Patient', patient1.id);
      expect(readPatient1).toBeDefined();
      expect(readPatient1.meta?.account).toBeDefined();

      const patient2 = await repo2.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        birthDate: '1970-01-01',
      });
      expect(patient2.meta?.account?.reference).toStrictEqual('Organization/' + org2);
      expect(patient2.meta?.accounts).toHaveLength(1);
      expect(patient2.meta?.accounts).toContainEqual({ reference: 'Organization/' + org2 });

      const readPatient2 = await repo2.readResource('Patient', patient2.id);
      expect(readPatient2.meta?.account?.reference).toStrictEqual('Organization/' + org2);
      expect(readPatient2.meta?.accounts).toHaveLength(1);
      expect(readPatient2.meta?.accounts).toContainEqual({ reference: 'Organization/' + org2 });

      await expect(repo2.readResource('Patient', patient1.id)).rejects.toThrow('Not found');
      await expect(repo1.readResource('Patient', patient2.id)).rejects.toThrow('Not found');
    }));

  test("Access policy won't override existing account", () =>
    withTestContext(async () => {
      // Create an access policy with an account pointing to org1
      // Try to update with org2
      // Make sure that account remains pointing to org1
      const org1 = randomUUID();
      const org2 = randomUUID();

      const accessPolicy1: AccessPolicy = {
        resourceType: 'AccessPolicy',
        compartment: {
          reference: 'Organization/' + org1,
        },
        resource: [
          {
            resourceType: 'Patient',
          },
        ],
      };

      const accessPolicy2: AccessPolicy = {
        resourceType: 'AccessPolicy',
        compartment: {
          reference: 'Organization/' + org2,
        },
        resource: [
          {
            resourceType: 'Patient',
          },
        ],
      };

      const repo1 = new Repository({
        extendedMode: true,
        author: {
          reference: 'Practitioner/123',
        },
        accessPolicy: accessPolicy1,
      });

      const repo2 = new Repository({
        extendedMode: true,
        author: {
          reference: 'Practitioner/456',
        },
        accessPolicy: accessPolicy2,
      });

      let patient = await repo1.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        birthDate: '1970-01-01',
      });

      patient.gender = 'female';

      patient = await repo2.updateResource(patient);
      expect(patient.meta?.account?.reference).toStrictEqual('Organization/' + org1);
      expect(patient.meta?.accounts).toHaveLength(1);
      expect(patient.meta?.accounts).toContainEqual({ reference: 'Organization/' + org1 });
    }));

  test('Access policy restrict criteria', () =>
    withTestContext(async () => {
      const org1 = randomUUID();
      const org2 = randomUUID();

      const accessPolicy1: AccessPolicy = {
        resourceType: 'AccessPolicy',
        compartment: {
          reference: 'Organization/' + org1,
        },
        resource: [
          {
            resourceType: 'Patient',
            criteria: `Patient?_compartment=${org1}`,
          },
        ],
      };

      const accessPolicy2: AccessPolicy = {
        resourceType: 'AccessPolicy',
        compartment: {
          reference: 'Organization/' + org2,
        },
        resource: [
          {
            resourceType: 'Patient',
            criteria: `Patient?_compartment=${org2}`,
          },
        ],
      };

      const repo1 = new Repository({
        extendedMode: true,
        author: {
          reference: 'Practitioner/123',
        },
        accessPolicy: accessPolicy1,
      });

      const repo2 = new Repository({
        extendedMode: true,
        author: {
          reference: 'Practitioner/123',
        },
        accessPolicy: accessPolicy2,
      });

      const patient1 = await repo1.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        birthDate: '1970-01-01',
      });
      expect(patient1.meta?.account?.reference).toStrictEqual('Organization/' + org1);
      expect(patient1.meta?.accounts).toHaveLength(1);
      expect(patient1.meta?.accounts).toContainEqual({ reference: 'Organization/' + org1 });

      const readPatient1 = await repo1.readResource('Patient', patient1.id);
      expect(readPatient1.meta?.account?.reference).toStrictEqual('Organization/' + org1);
      expect(readPatient1.meta?.accounts).toHaveLength(1);
      expect(readPatient1.meta?.accounts).toContainEqual({ reference: 'Organization/' + org1 });

      const patient2 = await repo2.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        birthDate: '1970-01-01',
      });
      expect(patient2.meta?.account?.reference).toStrictEqual('Organization/' + org2);
      expect(patient2.meta?.accounts).toHaveLength(1);
      expect(patient2.meta?.accounts).toContainEqual({ reference: 'Organization/' + org2 });

      const readPatient2 = await repo2.readResource('Patient', patient2.id);
      expect(readPatient2.meta?.account?.reference).toStrictEqual('Organization/' + org2);
      expect(readPatient2.meta?.accounts).toHaveLength(1);
      expect(readPatient2.meta?.accounts).toContainEqual({ reference: 'Organization/' + org2 });

      await expect(repo2.readResource('Patient', patient1.id)).rejects.toThrow('Not found');
      await expect(repo1.readResource('Patient', patient2.id)).rejects.toThrow('Not found');
    }));

  test('Multiple entries per resource type', () =>
    withTestContext(async () => {
      const { repo } = await createTestProject({
        withRepo: true,
        accessPolicy: {
          resourceType: 'AccessPolicy',
          resource: [
            {
              resourceType: 'ServiceRequest',
              criteria: `ServiceRequest?status=active`,
            },
            {
              resourceType: 'ServiceRequest',
              criteria: `ServiceRequest?status=completed`,
              readonly: true,
            },
          ],
        },
      });

      // User can create a ServiceRequest with status=active
      const serviceRequest1 = await repo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        intent: 'order',
        status: 'active',
        subject: { reference: 'Patient/' + randomUUID() },
        code: { text: 'test' },
      });
      expect(serviceRequest1).toBeDefined();

      // User can update the ServiceRequest with status=active
      const serviceRequest2 = await repo.updateResource<ServiceRequest>({
        ...serviceRequest1,
        orderDetail: [{ text: 'test' }],
      });
      expect(serviceRequest2).toBeDefined();

      // Try to update the ServiceRequest to status=completed
      // This should fail
      await expect(repo.updateResource<ServiceRequest>({ ...serviceRequest2, status: 'completed' })).rejects.toThrow(
        'Forbidden'
      );
    }));

  test('ClientApplication with account restriction', () =>
    withTestContext(async () => {
      const account = 'Organization/' + randomUUID();

      // Create the access policy
      const accessPolicy = await systemRepo.createResource<AccessPolicy>({
        resourceType: 'AccessPolicy',
        compartment: {
          reference: account,
        },
        resource: [
          {
            resourceType: 'Observation',
            compartment: {
              reference: account,
            },
          },
          {
            resourceType: 'Patient',
            compartment: {
              reference: account,
            },
          },
        ],
      });

      // Create a ClientApplication with an account value
      const clientApplication = await systemRepo.createResource<ClientApplication>({
        resourceType: 'ClientApplication',
        secret: 'foo',
        redirectUri: 'https://example.com/',
        meta: {
          account: {
            reference: account,
          },
        },
      });
      expect(clientApplication).toBeDefined();

      // Create a repo for the ClientApplication
      // Use getRepoForLogin to generate the synthetic access policy
      const clientRepo = await getRepoForLogin({
        login: {
          resourceType: 'Login',
          user: createReference(clientApplication),
          authMethod: 'client',
          authTime: new Date().toISOString(),
        },
        membership: {
          resourceType: 'ProjectMembership',
          id: randomUUID(),
          project: {
            reference: 'Project/' + testProject.id,
          },
          profile: createReference(clientApplication as ClientApplication),
          accessPolicy: createReference(accessPolicy),
          user: createReference(clientApplication),
        },
        project: testProject,
        userConfig: {} as UserConfiguration,
      });

      // Create a Patient using the ClientApplication
      const patient = await clientRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Al'], family: 'Bundy' }],
        birthDate: '1975-12-12',
      });
      expect(patient).toBeDefined();

      // The Patient should have the account value set
      const patientCheck = await systemRepo.readResource('Patient', patient.id);
      expect(patientCheck.meta?.account?.reference).toStrictEqual(account);
      expect(patientCheck.meta?.accounts).toHaveLength(1);
      expect(patientCheck.meta?.accounts).toContainEqual({ reference: account });

      // Create an Observation using the ClientApplication
      const observation = await clientRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient as Patient),
        code: {
          text: 'test',
        },
        valueString: 'positive',
      });
      expect(observation).toBeDefined();

      // The Observation should have the account value set
      const observationCheck = await systemRepo.readResource('Observation', observation.id);
      expect(observationCheck.meta?.account?.reference).toStrictEqual(account);
      expect(observationCheck.meta?.accounts).toHaveLength(1);
      expect(observationCheck.meta?.accounts).toContainEqual({ reference: account });

      // Create a Patient outside of the account
      const patient2 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Peggy'], family: 'Bundy' }],
        birthDate: '1975-11-11',
      });
      expect(patient2).toBeDefined();

      // The ClientApplication should not be able to access it
      await expect(clientRepo.readResource<Patient>('Patient', patient2.id)).rejects.toThrow('Not found');

      // Create an Observation outside of the account
      const observation2 = await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        subject: createReference(patient2 as Patient),
        code: {
          text: 'test',
        },
        valueString: 'positive',
      });
      expect(observation2).toBeDefined();

      // The ClientApplication should not be able to access it
      await expect(clientRepo.readResource<Observation>('Observation', observation2.id)).rejects.toThrow('Not found');
    }));

  test('ClientApplication with access policy', () =>
    withTestContext(async () => {
      // Create the access policy
      const accessPolicy = await systemRepo.createResource<AccessPolicy>({
        resourceType: 'AccessPolicy',
        resource: [
          {
            resourceType: 'Patient',
          },
        ],
      });

      // Create a ClientApplication
      const clientApplication = await systemRepo.createResource<ClientApplication>({
        resourceType: 'ClientApplication',
        secret: 'foo',
        redirectUri: 'https://example.com/',
      });
      expect(clientApplication).toBeDefined();

      // Create a repo for the ClientApplication
      const clientRepo = await getRepoForLogin({
        login: {
          resourceType: 'Login',
          user: createReference(clientApplication),
          authMethod: 'client',
          authTime: new Date().toISOString(),
        },
        membership: {
          resourceType: 'ProjectMembership',
          id: randomUUID(),
          project: {
            reference: 'Project/' + testProject.id,
          },
          profile: createReference(clientApplication as ClientApplication),
          accessPolicy: createReference(accessPolicy),
          user: createReference(clientApplication),
        },
        project: testProject,
        userConfig: {} as UserConfiguration,
      });

      // Create a Patient using the ClientApplication
      const patient = await clientRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Al'], family: 'Bundy' }],
        birthDate: '1975-12-12',
      });
      expect(patient).toBeDefined();

      // Create an Observation using the ClientApplication
      // Observation is not in the AccessPolicy
      // So this should fail
      await expect(
        clientRepo.createResource<Observation>({
          resourceType: 'Observation',
          status: 'final',
          subject: createReference(patient as Patient),
          code: {
            text: 'test',
          },
          valueString: 'positive',
        })
      ).rejects.toThrow('Forbidden');
    }));

  test('Readonly fields on write', () =>
    withTestContext(async () => {
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        birthDate: '1970-01-01',
      });

      // AccessPolicy that hides Patient name
      const accessPolicy: AccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          {
            resourceType: 'Patient',
            readonlyFields: ['name'],
          },
        ],
      };

      const repo2 = new Repository({
        author: {
          reference: 'Practitioner/123',
        },
        accessPolicy,
      });

      const readResource = await repo2.readResource<Patient>('Patient', patient.id);
      expect(readResource).toMatchObject({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        birthDate: '1970-01-01',
      });

      const writeResource = await repo2.updateResource<Patient>({
        ...readResource,
        active: true,
        name: [{ given: ['Morty'], family: 'Smith' }],
      });
      expect(writeResource).toMatchObject({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        birthDate: '1970-01-01',
        active: true,
      });
    }));

  test.skip('Readonly choice-of-type fields on write', () =>
    withTestContext(async () => {
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        birthDate: '1970-01-01',
        multipleBirthInteger: 2,
      });

      const accessPolicy: AccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          {
            resourceType: 'Patient',
            readonlyFields: ['multipleBirth[x]'],
          },
        ],
      };

      const repo2 = new Repository({
        author: {
          reference: 'Practitioner/123',
        },
        accessPolicy,
      });

      const readResource = await repo2.readResource<Patient>('Patient', patient.id);
      expect(readResource).toMatchObject({
        resourceType: 'Patient',
        birthDate: '1970-01-01',
        multipleBirthInteger: 2,
      });

      // multipleBirthInteger is readonly and should be ignored
      const writeResource = await repo2.updateResource<Patient>({
        ...readResource,
        active: true,
        multipleBirthInteger: 3,
      });
      expect(writeResource).toMatchObject({
        resourceType: 'Patient',
        birthDate: '1970-01-01',
        multipleBirthInteger: 2,
        active: true,
      });
    }));

  test('Try to create with readonly property', () =>
    withTestContext(async () => {
      const value = randomUUID();

      // AccessPolicy with Patient.identifier readonly
      const accessPolicy: AccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          {
            resourceType: 'Patient',
            readonlyFields: ['identifier'],
          },
        ],
      };

      const repo = new Repository({
        author: {
          reference: 'Practitioner/123',
        },
        accessPolicy,
      });

      // Create a patient with an identifier
      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Identifier'], family: 'Test' }],
        identifier: [{ system: 'https://example.com/', value }],
      });
      expect(patient.identifier).toBeUndefined();
    }));

  test.skip('Try to create with readonly choice-of-type property', () =>
    withTestContext(async () => {
      const accessPolicy: AccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          {
            resourceType: 'Patient',
            readonlyFields: ['multipleBirth[x]'],
          },
        ],
      };

      const repo = new Repository({
        author: {
          reference: 'Practitioner/123',
        },
        accessPolicy,
      });

      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        active: false,
        multipleBirthBoolean: true,
      });
      expect(patient.multipleBirthBoolean).toBeUndefined();
      expect(patient).toMatchObject({
        resourceType: 'Patient',
        active: false,
      });
    }));

  test('Try to add readonly property', () =>
    withTestContext(async () => {
      const value = randomUUID();

      // Create a patient
      const patient1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Identifier'], family: 'Test' }],
      });

      // AccessPolicy with Patient.identifier readonly
      const accessPolicy: AccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          {
            resourceType: 'Patient',
            readonlyFields: ['identifier'],
          },
        ],
      };

      const repo = new Repository({
        author: {
          reference: 'Practitioner/123',
        },
        accessPolicy,
      });

      // Try to add an identifier
      // This returns success, but the result should not have an identifier
      const patient2 = await repo.updateResource<Patient>({
        ...patient1,
        identifier: [{ system: 'https://example.com/', value }],
      });
      expect(patient2.identifier).toBeUndefined();

      // Try to search for the identifier
      // This should still return the result succeed
      const bundle2 = await repo.search<Patient>({
        resourceType: 'Patient',
        filters: [
          {
            code: 'identifier',
            operator: Operator.EQUALS,
            value,
          },
        ],
      });
      expect(bundle2.entry?.length).toStrictEqual(0);
    }));

  test('Try to remove readonly property', () =>
    withTestContext(async () => {
      const value = randomUUID();

      // Create a patient with an identifier
      const patient1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Identifier'], family: 'Test' }],
        identifier: [{ system: 'https://example.com/', value }],
      });

      // Search for patient by identifier
      // This should succeed
      const bundle1 = await systemRepo.search<Patient>({
        resourceType: 'Patient',
        filters: [
          {
            code: 'identifier',
            operator: Operator.EQUALS,
            value,
          },
        ],
      });
      expect(bundle1.entry?.length).toStrictEqual(1);

      // AccessPolicy with Patient.identifier readonly
      const accessPolicy: AccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          {
            resourceType: 'Patient',
            readonlyFields: ['identifier'],
          },
        ],
      };

      const repo = new Repository({
        author: {
          reference: 'Practitioner/123',
        },
        accessPolicy,
      });

      const { identifier, ...rest } = patient1;
      expect(identifier).toBeDefined();
      expect((rest as Patient).identifier).toBeUndefined();

      // Try to update the patient without the identifier
      // Effectively, try to remove the identifier
      // This returns success, but the identifier should still be there
      const patient2 = await repo.updateResource<Patient>(rest);
      expect(patient2.identifier).toBeDefined();
      expect(patient2.identifier?.[0]?.value).toStrictEqual(value);

      // Try to search for the identifier
      // This should still return the result succeed
      const bundle2 = await repo.search<Patient>({
        resourceType: 'Patient',
        filters: [
          {
            code: 'identifier',
            operator: Operator.EQUALS,
            value,
          },
        ],
      });
      expect(bundle2.entry?.length).toStrictEqual(1);
    }));

  test.skip('Try to remove readonly choice-of-type property', () =>
    withTestContext(async () => {
      // Create a patient with an identifier
      const patient1 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Identifier'], family: 'Test' }],
        multipleBirthInteger: 2,
      });

      // AccessPolicy with Patient.identifier readonly
      const accessPolicy: AccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          {
            resourceType: 'Patient',
            readonlyFields: ['multipleBirth[x]'],
          },
        ],
      };

      const repo = new Repository({
        author: { reference: 'Practitioner/123' },
        accessPolicy,
      });

      const { multipleBirthInteger, ...rest } = patient1;
      expect(multipleBirthInteger).toStrictEqual(2);
      expect((rest as Patient).multipleBirthInteger).toBeUndefined();

      // Try to update the patient without multipleBirth[x]
      // Effectively, try to remove it
      // This returns success, but multipleBirth[x] is still there
      const patient2 = await repo.updateResource<Patient>(rest);
      expect(patient2.multipleBirthInteger).toStrictEqual(2);
    }));

  test('Hidden fields on read', () =>
    withTestContext(async () => {
      const { repo: repo2, project } = await createTestProject({
        withRepo: true,
        // AccessPolicy that hides Patient name
        accessPolicy: {
          resourceType: 'AccessPolicy',
          resource: [
            {
              resourceType: 'Patient',
              hiddenFields: ['name'],
            },
          ],
        },
      });

      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        meta: { project: project.id },
        name: [{ given: ['Alice'], family: 'Smith' }],
        birthDate: '1970-01-01',
      });

      const readResource = await repo2.readResource<Patient>('Patient', patient.id);
      expect(readResource).toMatchObject({
        resourceType: 'Patient',
        birthDate: '1970-01-01',
      });
      expect(readResource.name).toBeUndefined();

      const historyBundle = await repo2.readHistory<Patient>('Patient', patient.id);
      expect(historyBundle).toMatchObject({
        resourceType: 'Bundle',
        type: 'history',
        entry: [
          {
            resource: {
              resourceType: 'Patient',
              birthDate: '1970-01-01',
            },
          },
        ],
      });
      expect(historyBundle.entry?.[0]?.resource?.name).toBeUndefined();
    }));

  test('Nested hidden fields on read', () =>
    withTestContext(async () => {
      const { repo: repo2, project } = await createTestProject({
        withRepo: true,
        // AccessPolicy that hides ServiceRequest subject.display
        accessPolicy: {
          resourceType: 'AccessPolicy',
          resource: [
            {
              resourceType: 'ServiceRequest',
              hiddenFields: ['subject.display'],
            },
          ],
        },
      });

      const serviceRequest = await systemRepo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        meta: { project: project.id },
        status: 'active',
        intent: 'order',
        code: {
          text: 'test',
        },
        subject: {
          reference: 'Patient/' + randomUUID(),
          display: 'Alice Smith',
        },
      });

      const readResource = await repo2.readResource<ServiceRequest>('ServiceRequest', serviceRequest.id);
      expect(readResource).toMatchObject<Partial<ServiceRequest>>({
        resourceType: 'ServiceRequest',
        code: {
          text: 'test',
        },
      });
      expect(readResource.subject?.reference).toBeDefined();
      expect(readResource.subject?.display).toBeUndefined();

      const historyBundle = await repo2.readHistory<ServiceRequest>('ServiceRequest', serviceRequest.id);
      expect(historyBundle).toMatchObject({
        resourceType: 'Bundle',
        type: 'history',
        entry: [
          {
            resource: {
              resourceType: 'ServiceRequest',
              code: {
                text: 'test',
              },
            },
          },
        ],
      });
      expect(historyBundle.entry?.[0]?.resource?.subject).toBeDefined();
      expect(historyBundle.entry?.[0]?.resource?.subject?.reference).toBeDefined();
      expect(historyBundle.entry?.[0]?.resource?.subject?.display).toBeUndefined();
    }));

  test('Nested hidden fields on array element', () =>
    withTestContext(async () => {
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });

      const accessPolicy: AccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [{ resourceType: 'Patient', hiddenFields: ['name.family'] }],
      };

      const repo2 = new Repository({
        author: { reference: 'Practitioner/123' },
        accessPolicy,
      });

      const readResource = await repo2.readResource<Patient>('Patient', patient.id);
      expect(readResource).toMatchObject({
        resourceType: 'Patient',
        name: [{ given: ['Alice'] }],
      });

      expect(readResource.name?.[0]).toBeDefined();
      expect(readResource.name?.[0].given).toStrictEqual(['Alice']);
      expect(readResource.name?.[0].family).toBeUndefined();
    }));

  test('Hidden fields on possible missing values', () =>
    withTestContext(async () => {
      // Create an Observation with a valueQuantity
      const obs1 = await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        valueQuantity: {
          value: 123,
          unit: 'mmHg',
        },
      });

      // Create an Observation with a valueString
      const obs2 = await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        valueString: 'test',
      });

      // AccessPolicy that hides Observation valueQuantity.value
      const accessPolicy: AccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          {
            resourceType: 'Observation',
            hiddenFields: ['valueQuantity.value'],
          },
        ],
      };

      const repo2 = new Repository({ author: { reference: 'Practitioner/123' }, accessPolicy });

      const readResource1 = await repo2.readResource<Observation>('Observation', obs1.id);
      expect(readResource1).toMatchObject({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        valueQuantity: {
          unit: 'mmHg',
        },
      });
      expect(readResource1.valueQuantity).toBeDefined();
      expect(readResource1.valueQuantity?.unit).toBeDefined();
      expect(readResource1.valueQuantity?.value).toBeUndefined();

      const readResource2 = await repo2.readResource<Observation>('Observation', obs2.id);
      expect(readResource2).toMatchObject({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        valueString: 'test',
      });
      expect(readResource2.valueString).toBeDefined();
      expect(readResource2.valueQuantity).toBeUndefined();
    }));

  test('Hide nonexistent field', () =>
    withTestContext(async () => {
      const { repo: repo2, project } = await createTestProject({
        withRepo: true,
        // AccessPolicy that hides ServiceRequest subject.display
        accessPolicy: {
          resourceType: 'AccessPolicy',
          resource: [
            {
              resourceType: 'ServiceRequest',
              hiddenFields: ['subject.display'],
            },
          ],
        },
      });

      const serviceRequest = await systemRepo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        meta: { project: project.id },
        status: 'active',
        intent: 'order',
        code: {
          text: 'test',
        },
        subject: {
          reference: 'Patient/' + randomUUID(),
        },
      });

      const readResource = await repo2.readResource<ServiceRequest>('ServiceRequest', serviceRequest.id);
      expect(readResource).toMatchObject({
        resourceType: 'ServiceRequest',
        code: {
          text: 'test',
        },
      });
      expect(readResource.subject).toBeDefined();
      expect(readResource.subject?.reference).toBeDefined();
      expect(readResource.subject?.display).toBeUndefined();

      const historyBundle = await repo2.readHistory<ServiceRequest>('ServiceRequest', serviceRequest.id);
      expect(historyBundle).toMatchObject({
        resourceType: 'Bundle',
        type: 'history',
        entry: [
          {
            resource: {
              resourceType: 'ServiceRequest',
              code: {
                text: 'test',
              },
            },
          },
        ],
      });
      expect(historyBundle.entry?.[0]?.resource?.subject).toBeDefined();
      expect(historyBundle.entry?.[0]?.resource?.subject?.reference).toBeDefined();
      expect(historyBundle.entry?.[0]?.resource?.subject?.display).toBeUndefined();
    }));

  test.skip('Hidden choice-of-type field', () =>
    withTestContext(async () => {
      // Create an Observation with a valueQuantity
      const obsQuantity = await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        valueQuantity: {
          value: 123,
          unit: 'mmHg',
        },
      });

      // Create an Observation with a valueString
      const obsString = await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        valueString: 'test',
      });

      // AccessPolicy that hides Observation.value[x]
      const accessPolicy: AccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          {
            resourceType: 'Observation',
            hiddenFields: ['value[x]'],
          },
        ],
      };

      const repo2 = new Repository({ author: { reference: 'Practitioner/123' }, accessPolicy });

      const readResource1 = await repo2.readResource<Observation>('Observation', obsQuantity.id);
      expect(readResource1).toMatchObject({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
      });
      expect(readResource1.valueQuantity).toBeUndefined();
      expect(readResource1.valueString).toBeUndefined();

      const readResource2 = await repo2.readResource<Observation>('Observation', obsString.id);
      expect(readResource2).toMatchObject({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
      });
      expect(readResource2.valueQuantity).toBeUndefined();
      expect(readResource2.valueString).toBeDefined();
    }));

  test('Identifier criteria', () =>
    withTestContext(async () => {
      const identifier = randomUUID();
      const { repo: repo2, project } = await createTestProject({
        withRepo: true,
        // AccessPolicy that only allows one specific Questionnaire
        accessPolicy: {
          resourceType: 'AccessPolicy',
          resource: [
            {
              resourceType: 'Questionnaire',
              criteria: 'Questionnaire?identifier=https://example.com|' + identifier,
            },
          ],
        },
      });

      const questionnaire = await systemRepo.createResource<Questionnaire>({
        resourceType: 'Questionnaire',
        meta: { project: project.id },
        status: 'active',
        identifier: [{ system: 'https://example.com', value: identifier }],
      });

      const readResource = await repo2.readResource<Questionnaire>('Questionnaire', questionnaire.id);
      expect(readResource.id).toBe(questionnaire.id);

      const historyBundle = await repo2.readHistory<Questionnaire>('Questionnaire', questionnaire.id);
      expect(historyBundle.entry).toHaveLength(1);
      expect(historyBundle.entry?.[0]?.resource?.id).toBe(questionnaire.id);
    }));

  test('Pre- and post-write criteria', () =>
    withTestContext(async () => {
      const accessPolicy: AccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          {
            resourceType: 'Observation',
            writeConstraint: [
              {
                language: 'text/fhirpath',
                expression: `%before.exists() implies %before.status != 'final'`,
              },
              {
                language: 'text/fhirpath',
                expression: `status = 'final' implies subject.exists()`,
              },
            ],
          },
        ],
      };

      const repo = new Repository({
        author: {
          reference: 'Practitioner/123',
        },
        accessPolicy,
      });

      // Create test resource
      const obs: Observation = {
        resourceType: 'Observation',
        status: 'preliminary',
        code: {
          coding: [
            {
              system: LOINC,
              code: '11111-1',
            },
          ],
        },
      };
      const resource = await repo.createResource(obs);
      expect(resource.status).toStrictEqual('preliminary');

      resource.status = 'final';
      await expect(repo.updateResource(resource)).rejects.toThrow('Forbidden');
      resource.subject = { reference: 'Patient/test' };
      await expect(repo.updateResource(resource)).resolves.toBeDefined();
      resource.status = 'cancelled';
      await expect(repo.updateResource(resource)).rejects.toThrow('Forbidden');
    }));

  test('Overlapping resource policies', () =>
    withTestContext(async () => {
      const accessPolicy: AccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          {
            // ServiceRequest is readonly by default
            resourceType: 'ServiceRequest',
            readonly: true,
          },
          {
            // ServiceRequest is read/write when in 'active' status
            resourceType: 'ServiceRequest',
            criteria: 'ServiceRequest?status=active',
            readonly: false,
          },
        ],
      };

      const repo2 = new Repository({
        author: {
          reference: 'Practitioner/123',
        },
        accessPolicy,
      });

      // Can create in "active" status
      let sr = await repo2.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        subject: { reference: 'Patient/' + randomUUID() },
        code: { text: 'test' },
      });
      expect(sr.id).toBeDefined();

      // Can update in "active" status
      sr = await repo2.updateResource<ServiceRequest>({ ...sr, priority: 'stat' });
      // Cannot put into "completed" status
      await expect(repo2.updateResource<ServiceRequest>({ ...sr, status: 'completed' })).rejects.toThrow('Forbidden');
      // As admin, set the status
      sr = await systemRepo.updateResource<ServiceRequest>({ ...sr, status: 'completed' });
      // Can still read
      sr = await repo2.readResource<ServiceRequest>('ServiceRequest', sr.id);
      // Cannot update
      await expect(repo2.updateResource<ServiceRequest>({ ...sr, priority: 'routine' })).rejects.toThrow('Forbidden');
    }));

  test('Compound parameterized access policy', () =>
    withTestContext(async () => {
      const adminRepo = new Repository({
        author: { reference: 'Practitioner/' + randomUUID() },
        projects: [testProject],
        strictMode: true,
        extendedMode: true,
      });

      // Create 3 patients
      const p1 = await adminRepo.createResource<Patient>({ resourceType: 'Patient' });
      const p2 = await adminRepo.createResource<Patient>({ resourceType: 'Patient' });
      const p3 = await adminRepo.createResource<Patient>({ resourceType: 'Patient' });

      // Create access policy for a patient resource
      const accessPolicy: AccessPolicy = await adminRepo.createResource<AccessPolicy>({
        resourceType: 'AccessPolicy',
        resource: [
          {
            resourceType: 'Patient',
            criteria: 'Patient?_id=%patient.id',
          },
        ],
      });

      // Create project membership parameterized with 2 instances of the access policy
      const membership = await systemRepo.createResource<ProjectMembership>({
        resourceType: 'ProjectMembership',
        user: { reference: 'User/' + randomUUID() },
        project: { reference: 'Project/' + testProject.id },
        profile: { reference: 'Practitioner/' + randomUUID() },
        access: [
          {
            policy: createReference(accessPolicy),
            parameter: [{ name: 'patient', valueReference: createReference(p1) }],
          },
          {
            policy: createReference(accessPolicy),
            parameter: [{ name: 'patient', valueReference: createReference(p2) }],
          },
        ],
      });

      const repo2 = await getRepoForLogin({
        login: { resourceType: 'Login' } as Login,
        membership,
        project: testProject,
        userConfig: {} as UserConfiguration,
      });

      await expect(repo2.readResource<Patient>('Patient', p1.id)).resolves.toBeDefined();
      await expect(repo2.readResource<Patient>('Patient', p2.id)).resolves.toBeDefined();
      await expect(repo2.readResource<Patient>('Patient', p3.id)).rejects.toThrow('Not found');
    }));

  test('String parameters', () =>
    withTestContext(async () => {
      const adminRepo = new Repository({
        author: { reference: 'Practitioner/' + randomUUID() },
        projects: [testProject],
        strictMode: true,
        extendedMode: true,
      });

      const t1 = await adminRepo.createResource<Task>({ resourceType: 'Task', status: 'accepted', intent: 'order' });
      const t2 = await adminRepo.createResource<Task>({ resourceType: 'Task', status: 'completed', intent: 'order' });

      const accessPolicy: AccessPolicy = await adminRepo.createResource<AccessPolicy>({
        resourceType: 'AccessPolicy',
        resource: [
          {
            resourceType: 'Task',
            criteria: 'Task?status=%status',
          },
        ],
      });

      const membership = await systemRepo.createResource<ProjectMembership>({
        resourceType: 'ProjectMembership',
        meta: { project: testProject.id },
        user: { reference: 'User/' + randomUUID() },
        project: { reference: 'Project/' + testProject.id },
        profile: { reference: 'Practitioner/' + randomUUID() },
        access: [
          {
            policy: createReference(accessPolicy),
            parameter: [{ name: 'status', valueString: 'accepted' }],
          },
        ],
      });

      const repo2 = await getRepoForLogin({
        login: { resourceType: 'Login' } as Login,
        membership,
        project: testProject,
        userConfig: {} as UserConfiguration,
      });

      await expect(repo2.readResource('Task', t1.id)).resolves.toBeDefined();
      await expect(repo2.readResource('Task', t2.id)).rejects.toThrow('Not found');
    }));

  test('Project admin with access policy', () =>
    withTestContext(async () => {
      const project = await systemRepo.createResource<Project>({ resourceType: 'Project', name: 'Test Project' });

      const adminRepo = new Repository({
        author: { reference: 'Practitioner/' + randomUUID() },
        projects: [project],
        strictMode: true,
        extendedMode: true,
      });

      const patient = await adminRepo.createResource<Patient>({ resourceType: 'Patient' });
      const task = await adminRepo.createResource<Task>({ resourceType: 'Task', status: 'accepted', intent: 'order' });

      const accessPolicy: AccessPolicy = await adminRepo.createResource<AccessPolicy>({
        resourceType: 'AccessPolicy',
        resource: [
          {
            resourceType: 'Patient',
          },
        ],
      });

      // Create an admin user with access policy
      const adminInviteResult = await inviteUser({
        resourceType: 'Practitioner',
        project,
        externalId: randomUUID(),
        firstName: 'X',
        lastName: 'Y',
        sendEmail: false,
        membership: {
          admin: true,
          accessPolicy: createReference(accessPolicy),
        },
      });

      const membership = adminInviteResult.membership;

      // Create a project-scoped user
      const inviteResult = await inviteUser({
        resourceType: 'Patient',
        project,
        externalId: randomUUID(),
        firstName: 'X',
        lastName: 'Y',
        sendEmail: false,
      });

      const repo2 = await getRepoForLogin({
        login: { resourceType: 'Login' } as Login,
        membership,
        project,
        userConfig: {} as UserConfiguration,
      });

      // Read Patient - allowed by AccessPolicy
      const check1 = await repo2.readResource<Patient>('Patient', patient.id);
      expect(check1.id).toBe(patient.id);

      // Read Project - added to synthetic AccessPolicy
      const check2 = await repo2.readResource<Project>('Project', project.id);
      expect(check2.id).toStrictEqual(project.id);

      // Read ProjectMembership - added to synthetic AccessPolicy
      const check3 = await repo2.readResource<ProjectMembership>('ProjectMembership', membership.id);
      expect(check3.id).toStrictEqual(membership.id);

      // Update ProjectMembership - added to synthetic AccessPolicy
      const check6 = await repo2.updateResource<ProjectMembership>({ ...check3, externalId: randomUUID() });
      expect(check6.id).toStrictEqual(check3.id);
      expect(check6.meta?.versionId).not.toStrictEqual(check3.meta?.versionId);

      // Search (Project-scoped) Users - added to synthetic AccessPolicy
      const check4 = await repo2.searchResources<User>({ resourceType: 'User' });
      expect(check4).toHaveLength(2);
      expect(check4.map((u) => u.id)).toStrictEqual(
        expect.arrayContaining([inviteResult.user.id, adminInviteResult.user.id])
      );

      // Read Task - not permitted by AccessPolicy
      await expect(repo2.readResource<Task>('Task', task.id)).rejects.toThrow('Forbidden');
    }));

  test('Project admin cannot modify protected fields', () =>
    withTestContext(async () => {
      const project = await systemRepo.createResource<Project>({
        resourceType: 'Project',
        name: 'Test Project',
        systemSecret: [{ name: 'mySecret', valueString: 'foo' }],
      });

      const membership = await systemRepo.createResource<ProjectMembership>({
        resourceType: 'ProjectMembership',
        user: { reference: 'User/' + randomUUID() },
        project: { reference: 'Project/' + project.id },
        profile: { reference: 'Practitioner/' + randomUUID() },
        admin: true,
      });

      const repo2 = await getRepoForLogin(
        { login: { resourceType: 'Login' } as Login, membership, project, userConfig: {} as UserConfiguration },
        true
      );

      const check1 = await repo2.readResource<Project>('Project', project.id);
      expect(check1.id).toStrictEqual(project.id);

      // Try to change the project name
      // This should succeed
      const check2 = await repo2.updateResource<Project>({ ...check1, name: 'Updated name' });
      expect(check2.id).toStrictEqual(project.id);
      expect(check2.name).toStrictEqual('Updated name');
      expect(check2.meta?.versionId).not.toStrictEqual(project.meta?.versionId);
      expect(check2.meta?.compartment?.find((c) => c.reference === getReferenceString(project))).toBeTruthy();

      // Try to change protected fields
      // This should be a no-op
      const check3 = await repo2.updateResource<Project>({
        ...check2,
        superAdmin: true,
        features: ['bots'],
        systemSetting: [{ name: 'rateLimit', valueInteger: 1000000 }],
        systemSecret: [{ name: 'mySecret', valueString: 'bar' }],
      });
      expect(check3.id).toStrictEqual(project.id);
      expect(check3.meta?.versionId).toStrictEqual(check2.meta?.versionId);
      expect(check3.superAdmin).toBeUndefined();
      expect(check3.features).toBeUndefined();
      expect(check3.systemSetting).toBeUndefined();
      expect(check3.systemSecret).toBeUndefined();

      const check4 = await repo2.readResource<ProjectMembership>('ProjectMembership', membership.id);
      expect(check4.id).toStrictEqual(membership.id);

      // Try to change the membership
      // This should succeed
      const check5 = await repo2.updateResource<ProjectMembership>({
        ...check4,
        profile: { reference: 'Practitioner/' + randomUUID() },
      });
      expect(check5.id).toStrictEqual(check4.id);
      expect(check5.meta?.versionId).not.toStrictEqual(check4.meta?.versionId);
      expect(check5.meta?.compartment?.find((c) => c.reference === getReferenceString(project))).toBeTruthy();

      // Try to change protected fields
      // This should be a no-op
      const check6 = await repo2.updateResource<ProjectMembership>({
        ...check5,
        project: { reference: 'Project/' + randomUUID() },
      });
      expect(check6.id).toStrictEqual(check4.id);
      expect(check6.meta?.versionId).toStrictEqual(check5.meta?.versionId);
      expect(check6.project?.reference).toStrictEqual(check4.project?.reference);

      // Try to create a new project
      // This should fail
      try {
        await repo2.createResource<Project>({ resourceType: 'Project', name: 'Test Project' });
        throw new Error('Should not be able to create resource');
      } catch (err) {
        expect(normalizeErrorString(err)).toStrictEqual('Forbidden');
      }
    }));

  test('Project admin cannot override synthetic access policy for admin types', () =>
    withTestContext(async () => {
      const { project, login, membership } = await createTestProject({
        withAccessToken: true,
        withClient: true,
        project: {
          name: 'Test Project',
          systemSecret: [{ name: 'mySecret', valueString: 'foo' }],
        },
        membership: { admin: true },
        accessPolicy: {
          resource: [{ resourceType: '*' }, { resourceType: 'Project' }, { resourceType: 'ProjectMembership' }],
        },
      });
      const repo = await getRepoForLogin({ login, project, membership, userConfig: {} as UserConfiguration }, true);

      const check1 = await repo.readResource<Project>('Project', project.id);
      expect(check1.id).toStrictEqual(project.id);

      // Try to change the project name
      // This should succeed
      const check2 = await repo.updateResource<Project>({ ...check1, name: 'Updated name' });
      expect(check2.id).toStrictEqual(project.id);
      expect(check2.name).toStrictEqual('Updated name');
      expect(check2.meta?.versionId).not.toStrictEqual(project.meta?.versionId);
      expect(check2.meta?.compartment?.find((c) => c.reference === getReferenceString(project))).toBeTruthy();

      // Try to change protected fields
      // This should be a no-op
      const check3 = await repo.updateResource<Project>({
        ...check2,
        superAdmin: true,
        features: ['bots'],
        systemSetting: [{ name: 'rateLimit', valueInteger: 1000000 }],
        systemSecret: [{ name: 'mySecret', valueString: 'bar' }],
      });
      expect(check3.id).toStrictEqual(project.id);
      expect(check3.meta?.versionId).toStrictEqual(check2.meta?.versionId);
      expect(check3.superAdmin).toBeUndefined();
      expect(check3.features).toStrictEqual(project.features);
      expect(check3.systemSetting).toBeUndefined();
      expect(check3.systemSecret).toBeUndefined();

      const check4 = await repo.readResource<ProjectMembership>('ProjectMembership', membership.id);
      expect(check4.id).toStrictEqual(membership.id);

      // Try to change the membership
      // This should succeed
      const check5 = await repo.updateResource<ProjectMembership>({
        ...check4,
        profile: { reference: 'Practitioner/' + randomUUID() },
      });
      expect(check5.id).toStrictEqual(check4.id);
      expect(check5.meta?.versionId).not.toStrictEqual(check4.meta?.versionId);
      expect(check5.meta?.compartment?.find((c) => c.reference === getReferenceString(project))).toBeTruthy();

      // Try to change protected fields
      // This should be a no-op
      const check6 = await repo.updateResource<ProjectMembership>({
        ...check5,
        project: { reference: 'Project/' + randomUUID() },
      });
      expect(check6.id).toStrictEqual(check4.id);
      expect(check6.meta?.versionId).toStrictEqual(check5.meta?.versionId);
      expect(check6.project?.reference).toStrictEqual(check4.project?.reference);

      // Creating a new Project should fail
      await expect(repo.createResource({ resourceType: 'Project', name: 'Test Project' })).rejects.toThrow('Forbidden');
    }));

  test('Project admin can modify meta.account', () =>
    withTestContext(async () => {
      const project = await systemRepo.createResource<Project>({ resourceType: 'Project', name: 'Test Project' });

      const adminMembership = await systemRepo.createResource<ProjectMembership>({
        resourceType: 'ProjectMembership',
        user: { reference: 'User/' + randomUUID() },
        project: { reference: 'Project/' + project.id },
        profile: { reference: 'Practitioner/' + randomUUID() },
        admin: true,
      });

      const nonAdminMembership = await systemRepo.createResource<ProjectMembership>({
        resourceType: 'ProjectMembership',
        user: { reference: 'User/' + randomUUID() },
        project: { reference: 'Project/' + project.id },
        profile: { reference: 'Practitioner/' + randomUUID() },
        admin: false,
      });

      const adminRepo = await getRepoForLogin(
        {
          login: { resourceType: 'Login' } as Login,
          membership: adminMembership,
          project,
          userConfig: {} as UserConfiguration,
        },
        true
      );
      const nonAdminRepo = await getRepoForLogin(
        {
          login: { resourceType: 'Login' } as Login,
          membership: nonAdminMembership,
          project,
          userConfig: {} as UserConfiguration,
        },
        true
      );
      const account1 = 'Organization/' + randomUUID();
      const account2 = 'Organization/' + randomUUID();

      // Create a patient with account as project admin
      // Project admin should be allowed to set account
      const patient1 = await adminRepo.createResource<Patient>({
        resourceType: 'Patient',
        meta: {
          project: project.id,
          account: { reference: account1 },
        },
      });
      expect(patient1.meta?.account?.reference).toStrictEqual(account1);
      expect(patient1.meta?.accounts).toHaveLength(1);
      expect(patient1.meta?.accounts).toContainEqual({ reference: account1 });

      // Update the patient with account as project admin
      // Project admin should be allowed to set account
      const patient2 = await adminRepo.updateResource<Patient>({
        ...patient1,
        meta: {
          account: { reference: account2 },
        },
      });
      expect(patient2.meta?.account?.reference).toStrictEqual(account2);
      expect(patient2.meta?.accounts).toHaveLength(1);
      expect(patient2.meta?.accounts).toContainEqual({ reference: account2 });

      // Attempt to change the account as non-admin
      // This should be silently ignored
      const patient3 = await nonAdminRepo.updateResource<Patient>({
        ...patient2,
        meta: {
          account: { reference: 'Organization/' + randomUUID() },
        },
      });
      expect(patient3.meta?.versionId).toStrictEqual(patient2.meta?.versionId);
      expect(patient3.meta?.account?.reference).toStrictEqual(account2);
      expect(patient3.meta?.accounts).toHaveLength(1);
      expect(patient3.meta?.accounts).toContainEqual({ reference: account2 });

      // Specify properties in the meta object without overwriting the existing accounts
      const patient4 = await adminRepo.updateResource<Patient>(
        {
          ...patient3,
          meta: {
            security: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v3-Confidentiality',
                code: 'N',
              },
            ],
            tag: [
              {
                system: 'http://example.com',
                code: 'example-tag',
              },
            ],
          },
        },
        { inheritAccounts: true }
      );
      expect(patient4.meta?.security).toHaveLength(1);
      expect(patient4.meta?.accounts).toHaveLength(1); //did not get overwritten by the new accounts

      // If inheritAccounts is not specified, then the accounts will be overwritten
      const patient5 = await adminRepo.updateResource<Patient>({
        ...patient4,
        meta: {
          security: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-Confidentiality',
              code: 'N',
            },
          ],
          tag: [
            {
              system: 'http://example.com',
              code: 'example-tag',
            },
          ],
        },
      });
      expect(patient5.meta?.accounts).toBeUndefined(); //accounts were overwritten

      // Remove patient accounts as project admin
      // Project admin should be allowed to clear accounts
      const clearedPatient = await adminRepo.updateResource<Patient>({
        ...patient2,
        meta: {
          accounts: undefined,
          account: undefined,
        },
      });
      expect(clearedPatient.meta?.account).toBeUndefined();
      expect(clearedPatient.meta?.accounts).toBeUndefined();
    }));

  test('Project admin can set multiple accounts', () =>
    withTestContext(async () => {
      const project = await systemRepo.createResource<Project>({ resourceType: 'Project', name: 'Test Project' });

      const adminMembership = await systemRepo.createResource<ProjectMembership>({
        resourceType: 'ProjectMembership',
        user: { reference: 'User/' + randomUUID() },
        project: { reference: 'Project/' + project.id },
        profile: { reference: 'Practitioner/' + randomUUID() },
        admin: true,
      });

      const nonAdminMembership = await systemRepo.createResource<ProjectMembership>({
        resourceType: 'ProjectMembership',
        user: { reference: 'User/' + randomUUID() },
        project: { reference: 'Project/' + project.id },
        profile: { reference: 'Practitioner/' + randomUUID() },
        admin: false,
      });

      const adminRepo = await getRepoForLogin(
        {
          login: { resourceType: 'Login' } as Login,
          membership: adminMembership,
          project,
          userConfig: {} as UserConfiguration,
        },
        true
      );
      const nonAdminRepo = await getRepoForLogin(
        {
          login: { resourceType: 'Login' } as Login,
          membership: nonAdminMembership,
          project,
          userConfig: {} as UserConfiguration,
        },
        true
      );
      const account1 = 'Organization/' + randomUUID();
      const account2 = 'Organization/' + randomUUID();
      const account3 = 'Organization/' + randomUUID();

      // Create a patient with multiple accounts as project admin
      // Project admin should be allowed to set accounts
      const patient1 = await adminRepo.createResource<Patient>({
        resourceType: 'Patient',
        meta: {
          project: project.id,
          accounts: [{ reference: account1 }, { reference: account2 }],
        },
      });
      expect(patient1.meta?.account?.reference).toStrictEqual(account1);
      expect(patient1.meta?.accounts).toHaveLength(2);
      expect(patient1.meta?.accounts).toContainEqual({ reference: account1 });
      expect(patient1.meta?.accounts).toContainEqual({ reference: account2 });

      // Update the patient accounts as project admin
      // Project admin should be allowed to set accounts
      const patient2 = await adminRepo.updateResource<Patient>({
        ...patient1,
        meta: {
          accounts: [{ reference: account2 }, { reference: account3 }],
        },
      });
      expect(patient2.meta?.account?.reference).toStrictEqual(account2);
      expect(patient2.meta?.accounts).toHaveLength(2);
      expect(patient2.meta?.accounts).toContainEqual({ reference: account2 });
      expect(patient2.meta?.accounts).toContainEqual({ reference: account3 });

      // Update both account and accounts as project admin
      // Project admin should be allowed to set accounts: server will take the union of both fields
      const patient3 = await adminRepo.updateResource<Patient>({
        ...patient2,
        meta: {
          ...patient2.meta, // Includes previous meta.account (account2)
          accounts: [{ reference: account1 }],
        },
      });
      expect(patient3.meta?.account?.reference).toStrictEqual(account2);
      expect(patient3.meta?.accounts).toHaveLength(2);
      expect(patient3.meta?.accounts).toContainEqual({ reference: account1 });
      expect(patient3.meta?.accounts).toContainEqual({ reference: account2 });

      // Attempt to change the account as non-admin
      // This should be silently ignored
      const patient4 = await nonAdminRepo.updateResource<Patient>({
        ...patient3,
        meta: {
          accounts: [{ reference: 'Organization/' + randomUUID() }],
        },
      });
      expect(patient4.meta?.account?.reference).toStrictEqual(account2);
      expect(patient4.meta?.accounts).toHaveLength(2);
      expect(patient4.meta?.accounts).toContainEqual({ reference: account1 });
      expect(patient4.meta?.accounts).toContainEqual({ reference: account2 });
    }));

  test('Super Admin with access policy', () =>
    withTestContext(async () => {
      const { project, membership } = await createTestProject({ superAdmin: true, withClient: true });

      const adminRepo = new Repository({
        author: { reference: 'Practitioner/' + randomUUID() },
        projects: [project],
        strictMode: true,
        extendedMode: true,
        superAdmin: true,
      });

      const patient = await adminRepo.createResource<Patient>({ resourceType: 'Patient' });
      const task = await adminRepo.createResource<Task>({ resourceType: 'Task', status: 'accepted', intent: 'order' });

      const accessPolicy: AccessPolicy = await adminRepo.createResource<AccessPolicy>({
        resourceType: 'AccessPolicy',
        resource: [
          { resourceType: 'Patient' },
          { resourceType: 'User', criteria: 'User?_compartment=' + getReferenceString(project) },
          { resourceType: 'ProjectMembership', criteria: 'ProjectMembership?_id:not=' + membership.id },
        ],
      });

      // Create an admin user with access policy
      const adminInviteResult = await inviteUser({
        resourceType: 'Practitioner',
        project,
        externalId: randomUUID(),
        firstName: 'X',
        lastName: 'Y',
        sendEmail: false,
        membership: { accessPolicy: createReference(accessPolicy) },
      });

      const miniAdminMembership = adminInviteResult.membership;
      const miniAdminRepo = await getRepoForLogin({
        login: { resourceType: 'Login' } as Login,
        membership: miniAdminMembership,
        project,
        userConfig: {} as UserConfiguration,
      });

      // Read Patient - explicitly allowed by AccessPolicy
      const check1 = await miniAdminRepo.readResource<Patient>('Patient', patient.id);
      expect(check1.id).toBe(patient.id);

      // Read Project - added to synthetic AccessPolicy for super admin
      const check2 = await miniAdminRepo.readResource<Project>('Project', project.id);
      expect(check2.id).toStrictEqual(project.id);

      // Read specific ProjectMembership - allowed by AccessPolicy
      const check3 = await miniAdminRepo.readResource('ProjectMembership', miniAdminMembership.id);
      expect(check3.id).toStrictEqual(miniAdminMembership.id);

      // Update the ProjectMembership - allowed by AccessPolicy
      const check6 = await miniAdminRepo.updateResource({ ...check3, externalId: randomUUID() });
      expect(check6.id).toStrictEqual(check3.id);
      expect(check6.meta?.versionId).not.toStrictEqual(check3.meta?.versionId);

      // Read other ProjectMembership - not permitted by AccessPolicy
      await expect(miniAdminRepo.readResource('ProjectMembership', membership.id)).rejects.toThrow('Not found');

      // Create a project-scoped user
      const inviteResult = await inviteUser({
        resourceType: 'Patient',
        project,
        externalId: randomUUID(),
        firstName: 'X',
        lastName: 'Y',
        sendEmail: false,
      });

      // Search for Users - allowed and scoped by AccessPolicy
      const check4 = await miniAdminRepo.searchResources<User>({ resourceType: 'User' });
      expect(check4).toHaveLength(2);
      expect(check4.find((u) => u.id === inviteResult.user.id)).toBeDefined();

      // Read Task - not permitted by AccessPolicy
      await expect(miniAdminRepo.readResource<Task>('Task', task.id)).rejects.toThrow('Forbidden');
    }));

  test('Mutex resource type policies with hidden fields', () =>
    withTestContext(async () => {
      const project = await systemRepo.createResource<Project>({ resourceType: 'Project', name: 'Test1' });
      const org = await systemRepo.createResource<Organization>({ resourceType: 'Organization', name: 'Test2' });
      const orgRef = createReference(org);
      const accessPolicy = await systemRepo.createResource<AccessPolicy>({
        resourceType: 'AccessPolicy',
        meta: {
          project: project.id,
        },
        name: 'Hidden Fields Test',
        resource: [
          {
            resourceType: 'Observation',
            hiddenFields: ['valueQuantity', 'valueString', 'interpretation', 'note'],
            criteria: `Observation?_compartment:not=Organization/${org.id}`,
          },
          {
            resourceType: 'Observation',
            criteria: `Observation?_compartment=Organization/${org.id}`,
          },
        ],
      });
      const repo = new Repository({
        author: { reference: 'Practitioner/' + randomUUID() },
        projects: [project],
        projectAdmin: true,
        strictMode: true,
        extendedMode: true,
        accessPolicy,
      });

      const withHidden = await repo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'entered-in-error',
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '10164-2',
            },
          ],
        },
        subject: {
          reference: 'Patient/' + randomUUID(),
          display: 'Local Donor2',
        },
        valueQuantity: {
          value: 20,
          unit: '%',
        },
      });
      const withVisible = await repo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'entered-in-error',
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '10164-2',
            },
          ],
        },
        subject: {
          reference: 'Patient/' + randomUUID(),
          display: 'Local Donor2',
        },
        valueQuantity: {
          value: 10,
          unit: '%',
        },
        meta: {
          account: orgRef,
          compartment: [orgRef],
        },
      });

      const results = await repo.searchResources<Observation>({ resourceType: 'Observation' });
      expect(results).toHaveLength(2);
      expect(results.find((o) => o.id === withHidden.id)?.valueQuantity).toBeUndefined();
      expect(results.find((o) => o.id === withVisible.id)?.valueQuantity).toEqual<Quantity>({
        value: 10,
        unit: '%',
      });
    }));

  test('Project admin check references', () =>
    withTestContext(async () => {
      const project1 = await systemRepo.createResource<Project>({ resourceType: 'Project', name: 'Test1' });
      const repo1 = new Repository({
        author: { reference: 'Practitioner/' + randomUUID() },
        projects: [project1],
        projectAdmin: true,
        strictMode: true,
        extendedMode: true,
        checkReferencesOnWrite: true,
      });

      const project2 = await systemRepo.createResource<Project>({ resourceType: 'Project', name: 'Test2' });
      const repo2 = new Repository({
        author: { reference: 'Practitioner/' + randomUUID() },
        projects: [project2],
        projectAdmin: true,
        strictMode: true,
        extendedMode: true,
        checkReferencesOnWrite: true,
      });

      await expect(repo1.readResource('Project', project1.id)).resolves.toBeDefined();
      await expect(repo2.readResource('Project', project2.id)).resolves.toBeDefined();
      await expect(repo1.readResource('Project', project2.id)).rejects.toThrow('Not found');

      // Try to create a Patient in Project2 that references a Practitioner in Project1
      const practitioner = await repo1.createResource<Practitioner>({ resourceType: 'Practitioner' });
      await expect(
        repo2.createResource({ resourceType: 'Patient', generalPractitioner: [createReference(practitioner)] })
      ).rejects.toThrow('Invalid reference (Not found) (Patient.generalPractitioner[0])');
    }));

  test('Empty access policy allows reading StructureDefinitions', () =>
    withTestContext(async () => {
      const { project, login, membership } = await registerNew({
        firstName: 'First',
        lastName: 'Last',
        projectName: 'Empty Access Policy Test',
        email: randomUUID() + '@example.com',
        password: randomUUID(),
      });

      const accessPolicy = await systemRepo.createResource<AccessPolicy>({
        resourceType: 'AccessPolicy',
        meta: { project: project.id },
        name: 'Default Resource Types Test',
        resource: [],
      });

      // Update the membership with the access policy
      const updatedMembership = await systemRepo.updateResource<ProjectMembership>({
        ...membership,
        accessPolicy: createReference(accessPolicy),
      });

      // Get a repo for the user
      const repo = await getRepoForLogin(
        { login, membership: updatedMembership, project, userConfig: {} as UserConfiguration },
        true
      );

      // Try to search for StructureDefinitions, should succeed
      const bundle1 = await repo.search<StructureDefinition>({ resourceType: 'StructureDefinition' });
      expect(bundle1).toBeDefined();

      const sd = bundle1.entry?.[0]?.resource as WithId<StructureDefinition>;
      expect(sd.resourceType).toStrictEqual('StructureDefinition');

      await expect(repo.updateResource<StructureDefinition>({ ...sd, url: randomUUID() })).rejects.toThrow('Forbidden');
      await expect(repo.deleteResource('StructureDefinition', sd.id)).rejects.toThrow('Forbidden');
    }));

  test('Shared project read only', () =>
    withTestContext(async () => {
      const repo = new Repository({
        author: { reference: 'Practitioner/' + randomUUID() },
        projects: [testProject],
        projectAdmin: true,
        strictMode: true,
        extendedMode: true,
        checkReferencesOnWrite: true,
      });

      // Try to search for StructureDefinitions, should succeed
      const bundle1 = await repo.search<StructureDefinition>({ resourceType: 'StructureDefinition' });
      const sd = bundle1.entry?.[0]?.resource as WithId<StructureDefinition>;
      expect(sd.resourceType).toStrictEqual('StructureDefinition');

      await expect(repo.updateResource<StructureDefinition>({ ...sd, url: randomUUID() })).rejects.toThrow('Forbidden');
      await expect(repo.deleteResource('StructureDefinition', sd.id)).rejects.toThrow('Forbidden');
    }));

  test('Repo with multiple Projects', async () =>
    withTestContext(async () => {
      const patientData: Patient = {
        resourceType: 'Patient',
      };

      const project1 = await systemRepo.createResource<Project>({ resourceType: 'Project', name: 'Test1' });
      const repo1 = new Repository({
        author: { reference: 'Practitioner/' + randomUUID() },
        projects: [project1],
        projectAdmin: true,
        strictMode: true,
        extendedMode: true,
        checkReferencesOnWrite: true,
      });

      const project2 = await systemRepo.createResource<Project>({ resourceType: 'Project', name: 'Test2' });
      const repo2 = new Repository({
        author: { reference: 'Practitioner/' + randomUUID() },
        projects: [project2, project1],
        projectAdmin: true,
        strictMode: true,
        extendedMode: true,
        checkReferencesOnWrite: true,
      });

      const patient1 = await repo1.createResource(patientData);
      const patient2 = await repo2.createResource(patientData);

      await expect(repo1.readResource('Patient', patient1.id)).resolves.toEqual(patient1);
      await expect(repo1.readResource('Patient', patient2.id)).rejects.toBeInstanceOf(Error);
      await expect(repo2.readResource('Patient', patient1.id)).resolves.toEqual(patient1);
      await expect(repo2.readResource('Patient', patient2.id)).resolves.toEqual(patient2);
    }));

  test('Project Admin cannot link Projects', async () =>
    withTestContext(async () => {
      const { project, membership, login } = await registerNew({
        firstName: 'Link',
        lastName: 'Test',
        projectName: 'Project link test',
        email: randomUUID() + '@example.com',
        password: randomUUID(),
      });
      expect(project.link).toBeUndefined();
      const repo = await getRepoForLogin({ login, membership, project, userConfig: {} as UserConfiguration }, true);

      project.link = [{ project: { reference: 'Project/foo' } }, { project: { reference: 'Project/bar' } }];

      const updatedProject = await repo.updateResource(project);
      expect(updatedProject.link).toBeUndefined();
    }));

  test('Build access policy with empty access array', async () =>
    withTestContext(async () => {
      const accessPolicy = await buildAccessPolicy({
        resourceType: 'ProjectMembership',
        project: createReference(testProject),
        user: { reference: 'User/123' },
        profile: { reference: 'Practitioner/123' },
        access: [],
      });

      expect(accessPolicy).toBeDefined();
      expect(accessPolicy.resource?.find((r) => r.resourceType === '*')).toBeDefined();
    }));

  test('AccessPolicy for Subscriptions with author in criteria', async () =>
    withTestContext(async () => {
      const { project, login, membership } = await registerNew({
        firstName: 'Project',
        lastName: 'Admin',
        projectName: 'Testing AccessPolicy for Subscriptions',
        email: randomUUID() + '@example.com',
        password: randomUUID(),
      });
      expect(project.link).toBeUndefined();

      // Create another user
      const { profile } = await addTestUser(project);

      // Create access policy to enforce
      const accessPolicy = await systemRepo.createResource<AccessPolicy>({
        resourceType: 'AccessPolicy',
        meta: {
          project: project.id,
        },
        name: 'Only own subscriptions',
        resource: [
          {
            resourceType: 'Subscription',
            criteria: 'Subscription?author=%profile',
          },
        ],
      });

      // Repo for project admin
      const projAdminRepo = await getRepoForLogin(
        { login, membership, project, userConfig: {} as UserConfiguration },
        true
      );

      // Repos for the test user

      const repoWithoutAccessPolicy = new Repository({
        author: createReference(profile),
        projects: [project],
        projectAdmin: false,
        strictMode: true,
        extendedMode: true,
      });

      const repoWithAccessPolicy = new Repository({
        author: createReference(profile),
        projects: [project],
        projectAdmin: false,
        strictMode: true,
        extendedMode: true,
        accessPolicy,
      });

      let subscription: Subscription;

      // Create -- Without access policy

      // Test creating rest-hook subscriptions
      subscription = await repoWithoutAccessPolicy.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'For testing creating subscriptions',
        status: 'active',
        criteria: 'Communication',
        channel: {
          type: 'rest-hook',
          endpoint: 'http://localhost:1337',
        },
      });
      expect(subscription).toBeDefined();

      // Test creating WebSocket subscriptions
      subscription = await repoWithoutAccessPolicy.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'For testing creating subscriptions',
        status: 'active',
        criteria: 'Communication',
        channel: {
          type: 'websocket',
          endpoint: 'http://localhost:1337',
        },
      });
      expect(subscription).toBeDefined();

      // Create -- With access policy

      // Test creating rest-hook subscriptions
      await expect(
        repoWithAccessPolicy.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'For testing creating subscriptions',
          status: 'active',
          criteria: 'Communication',
          channel: {
            type: 'rest-hook',
            endpoint: 'http://localhost:1337',
          },
        })
      ).rejects.toThrow();

      // Test creating WebSocket subscriptions
      await expect(
        repoWithAccessPolicy.createResource<Subscription>({
          resourceType: 'Subscription',
          reason: 'For testing creating subscriptions',
          status: 'active',
          criteria: 'Communication',
          channel: {
            type: 'websocket',
          },
        })
      ).rejects.toThrow();

      // Search -- Without access policy

      // Subscriptions -- Rest hook and WebSocket
      const restHookSub = await projAdminRepo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'Project Admin Subscription',
        status: 'active',
        criteria: 'Patient?name=Homer',
        channel: {
          type: 'rest-hook',
          endpoint: 'http://localhost:1337',
        },
      });

      const websocketSub = await projAdminRepo.createResource<Subscription>({
        resourceType: 'Subscription',
        reason: 'Project Admin Subscription',
        status: 'active',
        criteria: 'Patient?name=Homer',
        channel: {
          type: 'websocket',
        },
      });

      // Test searching for rest-hook subscriptions
      let bundle = await repoWithoutAccessPolicy.search(
        parseSearchRequest('Subscription?type=rest-hook&criteria=Patient?name=Homer')
      );
      expect(bundle?.entry?.length).toStrictEqual(1);

      // Test searching for WebSocket subscriptions
      bundle = await repoWithoutAccessPolicy.search(
        parseSearchRequest('Subscription?type=websocket&criteria=Patient?name=Homer')
      );
      // This actually returns 0 for now because search doesn't know about cache-only resources
      expect(bundle?.entry?.length).toStrictEqual(0);

      // Search -- With access policy
      // Test searching for rest-hook subscriptions
      bundle = await repoWithAccessPolicy.search(
        parseSearchRequest('Subscription?type=rest-hook&criteria=Patient?name=Homer')
      );
      expect(bundle?.entry?.length).toStrictEqual(0);

      // Test searching for WebSocket subscriptions
      bundle = await repoWithAccessPolicy.search(
        parseSearchRequest('Subscription?type=websocket&criteria=Patient?name=Homer')
      );
      // This actually returns 0 for now because search doesn't know about cache-only resources
      expect(bundle?.entry?.length).toStrictEqual(0);

      // Updating subscription -- Without access policy

      // Test updating a rest-hook subscription not owned
      const updatedRestHookSub = await repoWithoutAccessPolicy.updateResource<Subscription>({
        ...restHookSub,
        criteria: 'Patient',
      });
      expect(updatedRestHookSub).toMatchObject({ criteria: 'Patient' });

      // Test updating a WebSocket subscription not owned
      const updatedWebsocketSub = await repoWithoutAccessPolicy.updateResource<Subscription>({
        ...websocketSub,
        criteria: 'Patient',
      });
      expect(updatedWebsocketSub).toMatchObject({ criteria: 'Patient' });

      // Updating subscription -- With access policy

      // Test updating a rest-hook subscription not owned
      await expect(
        repoWithAccessPolicy.updateResource<Subscription>({
          ...updatedRestHookSub,
          criteria: 'Communication',
        })
      ).rejects.toThrow();

      // Test updating a WebSocket subscription not owned
      await expect(
        repoWithAccessPolicy.updateResource<Subscription>({
          ...updatedWebsocketSub,
          criteria: 'Communication',
        })
      ).rejects.toThrow();
    }));

  test.each<[AccessPolicyResource, string]>([
    [
      {
        resourceType: 'Patient',
        criteria: 'identifier=123',
        readonly: true,
      },
      'axp-3',
    ],
    [
      {
        resourceType: 'Patient',
        criteria: 'Patient',
      },
      'axp-3',
    ],
    [
      {
        resourceType: 'Practitioner',
        criteria: 'Patient?name=Dave',
      },
      'axp-3',
    ],
  ])('Server rejects invalid criteria %p', (policy, expectedError) =>
    withTestContext(async () => {
      await expect(
        systemRepo.createResource<AccessPolicy>({ resourceType: 'AccessPolicy', resource: [policy] })
      ).rejects.toThrow(expectedError);
    })
  );

  test('Wildcard policy with criteria', async () =>
    withTestContext(async () => {
      const compartment = 'Patient/' + randomUUID();
      const { repo, project } = await createTestProject({
        withRepo: true,
        accessPolicy: {
          resourceType: 'AccessPolicy',
          resource: [
            {
              resourceType: '*',
              criteria: `*?_compartment=${compartment}`,
            },
          ],
        },
      });

      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        meta: { project: project.id },
        link: [{ type: 'refer', other: { reference: compartment } }], // In the correct compartment
      });
      const readPatient = await repo.readResource('Patient', patient.id);
      expect(readPatient.meta?.compartment).toContainEqual({ reference: compartment });

      const patient2 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        meta: { project: project.id },
        // Not in the compartment; should not be accessible per the access policy
      });
      await expect(repo.readResource('Patient', patient2.id)).rejects.toThrow('Not found');
    }));

  test('Limit specific FHIR interactions', () =>
    withTestContext(async () => {
      const { repo } = await createTestProject({
        withRepo: true,
        accessPolicy: {
          resourceType: 'AccessPolicy',
          resource: [
            {
              resourceType: 'Condition',
              interaction: ['create', 'read'],
            },
          ],
        },
      });

      const condition = await repo.createResource<Condition>({
        resourceType: 'Condition',
        subject: { reference: 'Patient/foo' },
      });

      await expect(repo.readResource('Condition', condition.id)).resolves.toBeDefined();
      await expect(repo.search(parseSearchRequest('Condition?_id=' + condition.id))).rejects.toThrow('Forbidden');
      await expect(repo.readHistory('Condition', condition.id)).rejects.toThrow('Forbidden');
      await expect(repo.readVersion('Condition', condition.id, condition.meta?.versionId as string)).rejects.toThrow(
        'Forbidden'
      );
      await expect(repo.updateResource({ ...condition, onsetString: 'yesterday' })).rejects.toThrow('Forbidden');
      await expect(repo.deleteResource('Condition', condition.id)).rejects.toThrow('Forbidden');
    }));
});

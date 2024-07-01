import {
  createReference,
  getReferenceString,
  LOINC,
  normalizeErrorString,
  normalizeOperationOutcome,
  OperationOutcomeError,
  Operator,
  parseSearchRequest,
} from '@medplum/core';
import {
  AccessPolicy,
  ClientApplication,
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
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { inviteUser } from '../admin/invite';
import { initAppServices, shutdownApp } from '../app';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config';
import { addTestUser, createTestProject, withTestContext } from '../test.setup';
import { buildAccessPolicy, getRepoForLogin } from './accesspolicy';
import { getSystemRepo, Repository } from './repo';

describe('AccessPolicy', () => {
  let testProject: Project;
  const systemRepo = getSystemRepo();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  beforeEach(async () => {
    testProject = (await createTestProject()).project;
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

      try {
        await repo2.readResource('Patient', patient.id as string);
        fail('Expected error');
      } catch (err) {
        expect((err as OperationOutcomeError).outcome.id).toEqual('forbidden');
      }
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

      try {
        await repo2.search({ resourceType: 'Patient' });
        fail('Expected error');
      } catch (err) {
        expect((err as OperationOutcomeError).outcome.id).toEqual('forbidden');
      }
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

      const patient2 = await repo2.readResource('Patient', patient.id as string);
      expect(patient2).toBeDefined();

      try {
        await repo2.updateResource(patient);
        fail('Expected error');
      } catch (err) {
        expect((err as OperationOutcomeError).outcome.id).toEqual('forbidden');
      }
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

      const serviceRequest = await repo2.readResource('ServiceRequest', resource.id as string);
      expect(serviceRequest).toBeDefined();

      try {
        await repo2.updateResource(resource);
        fail('Expected error');
      } catch (err) {
        expect((err as OperationOutcomeError).outcome.id).toEqual('forbidden');
      }
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

      const serviceRequest = await repo2.readResource('ServiceRequest', resource.id as string);
      expect(serviceRequest).toBeDefined();

      try {
        await repo2.updateResource({ ...resource, status: 'completed' });
        fail('Expected error');
      } catch (err) {
        expect((err as OperationOutcomeError).outcome.id).toEqual('forbidden');
      }
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

      const patient2 = await repo2.readResource('Patient', patient.id as string);
      expect(patient2).toBeDefined();

      try {
        await repo2.deleteResource('Patient', patient.id as string);
        fail('Expected error');
      } catch (err) {
        expect((err as OperationOutcomeError).outcome.id).toEqual('forbidden');
      }
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
      expect(patient).toBeDefined();
      expect(patient.meta?.account?.reference).toEqual('Organization/' + orgId);

      const readPatient = await repo.readResource('Patient', patient.id as string);
      expect(readPatient).toBeDefined();
      expect(readPatient.meta?.account?.reference).toEqual('Organization/' + orgId);
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
      expect(patient.meta?.account).toBeDefined();
      expect(patient.meta?.account?.reference).toEqual('Organization/' + orgId);

      const readPatient = await repo.readResource('Patient', patient.id as string);
      expect(readPatient.meta?.account).toBeDefined();
      expect(readPatient.meta?.account?.reference).toEqual('Organization/' + orgId);
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
      expect(patient1.meta?.account?.reference).toEqual('Organization/' + org1);

      const readPatient1 = await repo1.readResource('Patient', patient1.id as string);
      expect(readPatient1).toBeDefined();
      expect(readPatient1.meta?.account).toBeDefined();

      const patient2 = await repo2.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        birthDate: '1970-01-01',
      });
      expect(patient2).toBeDefined();
      expect(patient2.meta?.account).toBeDefined();
      expect(patient2.meta?.account?.reference).toEqual('Organization/' + org2);

      const readPatient2 = await repo2.readResource('Patient', patient2.id as string);
      expect(readPatient2).toBeDefined();
      expect(readPatient2.meta?.account).toBeDefined();

      // Try to read patient1 with repo2
      // This should fail
      try {
        await repo2.readResource('Patient', patient1.id as string);
        fail('Expected error');
      } catch (err) {
        expect((err as OperationOutcomeError).outcome.id).toEqual('not-found');
      }

      // Try to read patient2 with repo1
      // This should fail
      try {
        await repo1.readResource('Patient', patient2.id as string);
        fail('Expected error');
      } catch (err) {
        expect((err as OperationOutcomeError).outcome.id).toEqual('not-found');
      }
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

      expect(patient).toBeDefined();
      expect(patient.meta?.account).toBeDefined();
      expect(patient.meta?.account?.reference).toEqual('Organization/' + org1);
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
      expect(patient1).toBeDefined();
      expect(patient1.meta?.account).toBeDefined();
      expect(patient1.meta?.account?.reference).toEqual('Organization/' + org1);

      const readPatient1 = await repo1.readResource('Patient', patient1.id as string);
      expect(readPatient1).toBeDefined();
      expect(readPatient1.meta?.account).toBeDefined();

      const patient2 = await repo2.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        birthDate: '1970-01-01',
      });
      expect(patient2).toBeDefined();
      expect(patient2.meta?.account).toBeDefined();
      expect(patient2.meta?.account?.reference).toEqual('Organization/' + org2);

      const readPatient2 = await repo2.readResource('Patient', patient2.id as string);
      expect(readPatient2).toBeDefined();
      expect(readPatient2.meta?.account).toBeDefined();

      // Try to read patient1 with repo2
      // This should fail
      try {
        await repo2.readResource('Patient', patient1.id as string);
        fail('Expected error');
      } catch (err) {
        expect((err as OperationOutcomeError).outcome.id).toEqual('not-found');
      }

      // Try to read patient2 with repo1
      // This should fail
      try {
        await repo1.readResource('Patient', patient2.id as string);
        fail('Expected error');
      } catch (err) {
        expect((err as OperationOutcomeError).outcome.id).toEqual('not-found');
      }
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

      // Try to update the ServiceRequest with status=completed
      // This should fail
      try {
        await repo.updateResource<ServiceRequest>({
          ...serviceRequest2,
          status: 'completed',
        });
        fail('Expected error');
      } catch (err) {
        expect((err as OperationOutcomeError).outcome.id).toEqual('forbidden');
      }
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
          project: {
            reference: 'Project/' + testProject.id,
          },
          profile: createReference(clientApplication as ClientApplication),
          accessPolicy: createReference(accessPolicy),
          user: createReference(clientApplication),
        },
        project: testProject,
      });

      // Create a Patient using the ClientApplication
      const patient = await clientRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Al'], family: 'Bundy' }],
        birthDate: '1975-12-12',
      });
      expect(patient).toBeDefined();

      // The Patient should have the account value set
      const patientCheck = await systemRepo.readResource('Patient', patient.id as string);
      expect(patientCheck.meta?.account?.reference).toEqual(account);

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
      const observationCheck = await systemRepo.readResource('Observation', observation.id as string);
      expect(observationCheck.meta?.account?.reference).toEqual(account);

      // Create a Patient outside of the account
      const patient2 = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Peggy'], family: 'Bundy' }],
        birthDate: '1975-11-11',
      });
      expect(patient2).toBeDefined();

      // The ClientApplication should not be able to access it
      try {
        await clientRepo.readResource<Patient>('Patient', patient2.id as string);
        fail('Expected error');
      } catch (err) {
        expect((err as OperationOutcomeError).outcome.id).toEqual('not-found');
      }

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
      try {
        await clientRepo.readResource<Observation>('Observation', observation2.id as string);
        fail('Expected error');
      } catch (err) {
        expect((err as OperationOutcomeError).outcome.id).toEqual('not-found');
      }
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
          project: {
            reference: 'Project/' + testProject.id,
          },
          profile: createReference(clientApplication as ClientApplication),
          accessPolicy: createReference(accessPolicy),
          user: createReference(clientApplication),
        },
        project: testProject,
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
      try {
        await clientRepo.createResource<Observation>({
          resourceType: 'Observation',
          status: 'final',
          subject: createReference(patient as Patient),
          code: {
            text: 'test',
          },
          valueString: 'positive',
        });
        fail('Expected error');
      } catch (err) {
        expect((err as OperationOutcomeError).outcome.id).toEqual('forbidden');
      }
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

      const readResource = await repo2.readResource<Patient>('Patient', patient.id as string);
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

      const readResource = await repo2.readResource<Patient>('Patient', patient.id as string);
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
      expect(bundle2.entry?.length).toEqual(0);
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
      expect(bundle1.entry?.length).toEqual(1);

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
      expect(patient2.identifier?.[0]?.value).toEqual(value);

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
      expect(bundle2.entry?.length).toEqual(1);
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
      expect(multipleBirthInteger).toEqual(2);
      expect((rest as Patient).multipleBirthInteger).toBeUndefined();

      // Try to update the patient without multipleBirth[x]
      // Effectively, try to remove it
      // This returns success, but multipleBirth[x] is still there
      const patient2 = await repo.updateResource<Patient>(rest);
      expect(patient2.multipleBirthInteger).toEqual(2);
    }));

  test('Hidden fields on read', () =>
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
            hiddenFields: ['name'],
          },
        ],
      };

      const repo2 = new Repository({
        author: {
          reference: 'Practitioner/123',
        },
        accessPolicy,
      });

      const readResource = await repo2.readResource<Patient>('Patient', patient.id as string);
      expect(readResource).toMatchObject({
        resourceType: 'Patient',
        birthDate: '1970-01-01',
      });
      expect(readResource.name).toBeUndefined();

      const historyBundle = await repo2.readHistory<Patient>('Patient', patient.id as string);
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
      const serviceRequest = await systemRepo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
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

      // AccessPolicy that hides ServiceRequest subject.display
      const accessPolicy: AccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          {
            resourceType: 'ServiceRequest',
            hiddenFields: ['subject.display'],
          },
        ],
      };

      const repo2 = new Repository({
        author: {
          reference: 'Practitioner/123',
        },
        accessPolicy,
      });

      const readResource = await repo2.readResource<ServiceRequest>('ServiceRequest', serviceRequest.id as string);
      expect(readResource).toMatchObject({
        resourceType: 'ServiceRequest',
        code: {
          text: 'test',
        },
      });
      expect(readResource.subject).toBeDefined();
      expect(readResource.subject?.reference).toBeDefined();
      expect(readResource.subject?.display).toBeUndefined();

      const historyBundle = await repo2.readHistory<ServiceRequest>('ServiceRequest', serviceRequest.id as string);
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

      const readResource = await repo2.readResource<Patient>('Patient', patient.id as string);
      expect(readResource).toMatchObject({
        resourceType: 'Patient',
        name: [{ given: ['Alice'] }],
      });

      expect(readResource.name?.[0]).toBeDefined();
      expect(readResource.name?.[0].given).toEqual(['Alice']);
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

      const readResource1 = await repo2.readResource<Observation>('Observation', obs1.id as string);
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

      const readResource2 = await repo2.readResource<Observation>('Observation', obs2.id as string);
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
      const serviceRequest = await systemRepo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        code: {
          text: 'test',
        },
        subject: {
          reference: 'Patient/' + randomUUID(),
        },
      });

      // AccessPolicy that hides ServiceRequest subject.display
      const accessPolicy: AccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          {
            resourceType: 'ServiceRequest',
            hiddenFields: ['subject.display'],
          },
        ],
      };

      const repo2 = new Repository({
        author: {
          reference: 'Practitioner/123',
        },
        accessPolicy,
      });

      const readResource = await repo2.readResource<ServiceRequest>('ServiceRequest', serviceRequest.id as string);
      expect(readResource).toMatchObject({
        resourceType: 'ServiceRequest',
        code: {
          text: 'test',
        },
      });
      expect(readResource.subject).toBeDefined();
      expect(readResource.subject?.reference).toBeDefined();
      expect(readResource.subject?.display).toBeUndefined();

      const historyBundle = await repo2.readHistory<ServiceRequest>('ServiceRequest', serviceRequest.id as string);
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

      const readResource1 = await repo2.readResource<Observation>('Observation', obsQuantity.id as string);
      expect(readResource1).toMatchObject({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
      });
      expect(readResource1.valueQuantity).toBeUndefined();
      expect(readResource1.valueString).toBeUndefined();

      const readResource2 = await repo2.readResource<Observation>('Observation', obsString.id as string);
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
      const questionnaire = await systemRepo.createResource<Questionnaire>({
        resourceType: 'Questionnaire',
        status: 'active',
        identifier: [{ system: 'https://example.com', value: randomUUID() }],
      });

      // AccessPolicy that only allows one specific Questionnaire
      const accessPolicy: AccessPolicy = {
        resourceType: 'AccessPolicy',
        resource: [
          {
            resourceType: 'Questionnaire',
            criteria: 'Questionnaire?identifier=' + questionnaire.identifier?.[0].value,
          },
        ],
      };

      const repo2 = new Repository({
        author: {
          reference: 'Practitioner/123',
        },
        accessPolicy,
      });

      const readResource = await repo2.readResource<Questionnaire>('Questionnaire', questionnaire.id as string);
      expect(readResource.id).toBe(questionnaire.id);

      const historyBundle = await repo2.readHistory<Questionnaire>('Questionnaire', questionnaire.id as string);
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
      expect(resource.status).toEqual('preliminary');

      resource.status = 'final';
      await expect(repo.updateResource(resource)).rejects.toEqual(new Error('Forbidden'));
      resource.subject = { reference: 'Patient/test' };
      await expect(repo.updateResource(resource)).resolves.toBeDefined();
      resource.status = 'cancelled';
      await expect(repo.updateResource(resource)).rejects.toEqual(new Error('Forbidden'));
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
      sr = await repo2.updateResource<ServiceRequest>({
        ...sr,
        priority: 'stat',
      });

      // Cannot put into "completed" status
      try {
        await repo2.updateResource<ServiceRequest>({
          ...sr,
          status: 'completed',
        });
        throw new Error('Should not be able to update resource');
      } catch (err) {
        expect(normalizeErrorString(err)).toEqual('Forbidden');
      }

      // As admin, set the status
      sr = await systemRepo.updateResource<ServiceRequest>({
        ...sr,
        status: 'completed',
      });

      // Can still read
      sr = await repo2.readResource<ServiceRequest>('ServiceRequest', sr.id as string);

      // Cannot update
      try {
        await repo2.updateResource<ServiceRequest>({
          ...sr,
          priority: 'routine',
        });
        throw new Error('Should not be able to update resource');
      } catch (err) {
        expect(normalizeErrorString(err)).toEqual('Forbidden');
      }
    }));

  test('Compound parameterized access policy', () =>
    withTestContext(async () => {
      const adminRepo = new Repository({
        author: { reference: 'Practitioner/' + randomUUID() },
        projects: [testProject.id as string],
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
      });

      const check1 = await repo2.readResource<Patient>('Patient', p1.id as string);
      expect(check1.id).toBe(p1.id);

      const check2 = await repo2.readResource<Patient>('Patient', p2.id as string);
      expect(check2.id).toBe(p2.id);

      try {
        await repo2.readResource<Patient>('Patient', p3.id as string);
        throw new Error('Should not be able to read resource');
      } catch (err) {
        expect(normalizeErrorString(err)).toEqual('Not found');
      }
    }));

  test('String parameters', () =>
    withTestContext(async () => {
      const adminRepo = new Repository({
        author: { reference: 'Practitioner/' + randomUUID() },
        projects: [testProject.id as string],
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
      });

      const check1 = await repo2.readResource<Task>('Task', t1.id as string);
      expect(check1.id).toBe(t1.id);

      try {
        await repo2.readResource<Task>('Task', t2.id as string);
        throw new Error('Should not be able to read resource');
      } catch (err) {
        expect(normalizeErrorString(err)).toEqual('Not found');
      }
    }));

  test('Project admin with access policy', () =>
    withTestContext(async () => {
      const project = await systemRepo.createResource<Project>({ resourceType: 'Project', name: 'Test Project' });

      const adminRepo = new Repository({
        author: { reference: 'Practitioner/' + randomUUID() },
        projects: [project.id as string],
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

      const repo2 = await getRepoForLogin({ login: { resourceType: 'Login' } as Login, membership, project });

      const check1 = await repo2.readResource<Patient>('Patient', patient.id as string);
      expect(check1.id).toBe(patient.id);

      const check2 = await repo2.readResource<Project>('Project', project.id as string);
      expect(check2.id).toEqual(project.id);

      const check3 = await repo2.readResource<ProjectMembership>('ProjectMembership', membership.id as string);
      expect(check3.id).toEqual(membership.id);

      const check4 = await repo2.searchResources<User>({ resourceType: 'User' });
      expect(check4).toBeDefined();
      expect(check4.find((u) => u.id === inviteResult.user.id)).toBeDefined();

      try {
        await repo2.readResource<Task>('Task', task.id as string);
        throw new Error('Should not be able to read resource');
      } catch (err) {
        expect(normalizeErrorString(err)).toEqual('Forbidden');
      }

      // Update the project membership
      const check6 = await repo2.updateResource<ProjectMembership>({ ...check3, externalId: randomUUID() });
      expect(check6.id).toEqual(check3.id);
      expect(check6.meta?.versionId).not.toEqual(check3.meta?.versionId);
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

      const repo2 = await getRepoForLogin({ login: { resourceType: 'Login' } as Login, membership, project }, true);

      const check1 = await repo2.readResource<Project>('Project', project.id as string);
      expect(check1.id).toEqual(project.id);

      // Try to change the project name
      // This should succeed
      const check2 = await repo2.updateResource<Project>({ ...check1, name: 'Updated name' });
      expect(check2.id).toEqual(project.id);
      expect(check2.name).toEqual('Updated name');
      expect(check2.meta?.versionId).not.toEqual(project.meta?.versionId);
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
      expect(check3.id).toEqual(project.id);
      expect(check3.meta?.versionId).toEqual(check2.meta?.versionId);
      expect(check3.superAdmin).toBeUndefined();
      expect(check3.features).toBeUndefined();
      expect(check3.systemSetting).toBeUndefined();
      expect(check3.systemSecret).toBeUndefined();

      const check4 = await repo2.readResource<ProjectMembership>('ProjectMembership', membership.id as string);
      expect(check4.id).toEqual(membership.id);

      // Try to change the membership
      // This should succeed
      const check5 = await repo2.updateResource<ProjectMembership>({
        ...check4,
        profile: { reference: 'Practitioner/' + randomUUID() },
      });
      expect(check5.id).toEqual(check4.id);
      expect(check5.meta?.versionId).not.toEqual(check4.meta?.versionId);
      expect(check5.meta?.compartment?.find((c) => c.reference === getReferenceString(project))).toBeTruthy();

      // Try to change protected fields
      // This should be a no-op
      const check6 = await repo2.updateResource<ProjectMembership>({
        ...check5,
        project: { reference: 'Project/' + randomUUID() },
      });
      expect(check6.id).toEqual(check4.id);
      expect(check6.meta?.versionId).toEqual(check5.meta?.versionId);
      expect(check6.project?.reference).toEqual(check4.project?.reference);

      // Try to create a new project
      // This should fail
      try {
        await repo2.createResource<Project>({ resourceType: 'Project', name: 'Test Project' });
        throw new Error('Should not be able to create resource');
      } catch (err) {
        expect(normalizeErrorString(err)).toEqual('Forbidden');
      }
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
        { login: { resourceType: 'Login' } as Login, membership: adminMembership, project },
        true
      );
      const nonAdminRepo = await getRepoForLogin(
        { login: { resourceType: 'Login' } as Login, membership: nonAdminMembership, project },
        true
      );
      const account1 = randomUUID();
      const account2 = randomUUID();

      // Create a patient with account as project admin
      // Project admin should be allowed to set account
      const patient1 = await adminRepo.createResource<Patient>({
        resourceType: 'Patient',
        meta: {
          project: project.id,
          account: { reference: 'Organization/' + account1 },
        },
      });
      expect(patient1).toBeDefined();
      expect(patient1.meta?.account?.reference).toEqual('Organization/' + account1);

      // Update the patient with account as project admin
      // Project admin should be allowed to set account
      const patient2 = await adminRepo.updateResource<Patient>({
        ...patient1,
        meta: {
          ...patient1.meta,
          account: { reference: 'Organization/' + account2 },
        },
      });
      expect(patient2).toBeDefined();
      expect(patient2.meta?.account?.reference).toEqual('Organization/' + account2);

      // Attempt to change the account as non-admin
      // This should be silently ignored
      const patient3 = await nonAdminRepo.updateResource<Patient>({
        ...patient2,
        meta: {
          ...patient2.meta,
          account: { reference: 'Organization/' + randomUUID() },
        },
      });
      expect(patient3).toBeDefined();
      expect(patient3.meta?.versionId).toEqual(patient2.meta?.versionId);
      expect(patient3.meta?.account?.reference).toEqual('Organization/' + account2);
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
        projects: [project.id as string],
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
        projects: [project1.id as string],
        projectAdmin: true,
        strictMode: true,
        extendedMode: true,
        checkReferencesOnWrite: true,
      });

      const project2 = await systemRepo.createResource<Project>({ resourceType: 'Project', name: 'Test2' });
      const repo2 = new Repository({
        author: { reference: 'Practitioner/' + randomUUID() },
        projects: [project2.id as string],
        projectAdmin: true,
        strictMode: true,
        extendedMode: true,
        checkReferencesOnWrite: true,
      });

      const check1 = await repo1.readResource('Project', project1.id as string);
      expect(check1).toBeDefined();

      const check2 = await repo2.readResource('Project', project2.id as string);
      expect(check2).toBeDefined();

      try {
        await repo1.readResource('Project', project2.id as string);
        throw new Error('Should not be able to read resource');
      } catch (err) {
        expect(normalizeErrorString(err)).toEqual('Not found');
      }

      // Try to create a Patient in Project2 that references a Practitioner in Project1
      const practitioner = await repo1.createResource<Practitioner>({ resourceType: 'Practitioner' });
      try {
        await repo2.createResource({ resourceType: 'Patient', generalPractitioner: [createReference(practitioner)] });
        throw new Error('Should have failed reference check');
      } catch (err) {
        expect(normalizeErrorString(err)).toEqual('Invalid reference (Not found) (Patient.generalPractitioner[0])');
      }
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
      const repo = await getRepoForLogin({ login, membership: updatedMembership, project }, true);

      // Try to search for StructureDefinitions, should succeed
      const bundle1 = await repo.search<StructureDefinition>({ resourceType: 'StructureDefinition' });
      expect(bundle1).toBeDefined();

      const sd = bundle1.entry?.[0]?.resource as StructureDefinition;
      expect(sd.resourceType).toEqual('StructureDefinition');

      // Try to update StructureDefinition, should fail
      try {
        await repo.updateResource<StructureDefinition>({ ...sd, url: randomUUID() });
        throw new Error('Expected error');
      } catch (err) {
        const outcome = normalizeOperationOutcome(err);
        expect(outcome.issue?.[0]?.code).toEqual('forbidden');
      }

      // Try to delete StructureDefinition, should fail
      try {
        await repo.deleteResource('StructureDefinition', sd.id as string);
        throw new Error('Expected error');
      } catch (err) {
        const outcome = normalizeOperationOutcome(err);
        expect(outcome.issue?.[0]?.code).toEqual('forbidden');
      }
    }));

  test('Shared project read only', () =>
    withTestContext(async () => {
      const repo = new Repository({
        author: { reference: 'Practitioner/' + randomUUID() },
        projects: [testProject.id as string],
        projectAdmin: true,
        strictMode: true,
        extendedMode: true,
        checkReferencesOnWrite: true,
      });

      // Try to search for StructureDefinitions, should succeed
      const bundle1 = await repo.search<StructureDefinition>({ resourceType: 'StructureDefinition' });
      expect(bundle1).toBeDefined();

      const sd = bundle1.entry?.[0]?.resource as StructureDefinition;
      expect(sd.resourceType).toEqual('StructureDefinition');

      // Try to update StructureDefinition, should fail
      try {
        await repo.updateResource<StructureDefinition>({ ...sd, url: randomUUID() });
        throw new Error('Expected error');
      } catch (err) {
        const outcome = normalizeOperationOutcome(err);
        expect(outcome.issue?.[0]?.code).toEqual('forbidden');
      }

      // Try to delete StructureDefinition, should fail
      try {
        await repo.deleteResource('StructureDefinition', sd.id as string);
        throw new Error('Expected error');
      } catch (err) {
        const outcome = normalizeOperationOutcome(err);
        expect(outcome.issue?.[0]?.code).toEqual('forbidden');
      }
    }));

  test('Repo with multiple Projects', async () =>
    withTestContext(async () => {
      const patientData: Patient = {
        resourceType: 'Patient',
      };

      const project1 = await systemRepo.createResource<Project>({ resourceType: 'Project', name: 'Test1' });
      const repo1 = new Repository({
        author: { reference: 'Practitioner/' + randomUUID() },
        projects: [project1.id as string],
        projectAdmin: true,
        strictMode: true,
        extendedMode: true,
        checkReferencesOnWrite: true,
      });

      const project2 = await systemRepo.createResource<Project>({ resourceType: 'Project', name: 'Test2' });
      const repo2 = new Repository({
        author: { reference: 'Practitioner/' + randomUUID() },
        projects: [project2.id as string, project1.id as string],
        projectAdmin: true,
        strictMode: true,
        extendedMode: true,
        checkReferencesOnWrite: true,
      });

      const patient1 = await repo1.createResource(patientData);
      const patient2 = await repo2.createResource(patientData);

      await expect(repo1.readResource('Patient', patient1.id as string)).resolves.toEqual(patient1);
      await expect(repo1.readResource('Patient', patient2.id as string)).rejects.toBeInstanceOf(Error);
      await expect(repo2.readResource('Patient', patient1.id as string)).resolves.toEqual(patient1);
      await expect(repo2.readResource('Patient', patient2.id as string)).resolves.toEqual(patient2);
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
      const repo = await getRepoForLogin({ login, membership, project }, true);

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
      const projAdminRepo = await getRepoForLogin({ login, membership, project }, true);

      // Repos for the test user

      const repoWithoutAccessPolicy = new Repository({
        author: createReference(profile),
        projects: [project.id as string],
        projectAdmin: false,
        strictMode: true,
        extendedMode: true,
      });

      const repoWithAccessPolicy = new Repository({
        author: createReference(profile),
        projects: [project.id as string],
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
      expect(bundle?.entry?.length).toEqual(1);

      // Test searching for WebSocket subscriptions
      bundle = await repoWithoutAccessPolicy.search(
        parseSearchRequest('Subscription?type=websocket&criteria=Patient?name=Homer')
      );
      // This actually returns 0 for now because search doesn't know about cache-only resources
      expect(bundle?.entry?.length).toEqual(0);

      // Search -- With access policy
      // Test searching for rest-hook subscriptions
      bundle = await repoWithAccessPolicy.search(
        parseSearchRequest('Subscription?type=rest-hook&criteria=Patient?name=Homer')
      );
      expect(bundle?.entry?.length).toEqual(0);

      // Test searching for WebSocket subscriptions
      bundle = await repoWithAccessPolicy.search(
        parseSearchRequest('Subscription?type=websocket&criteria=Patient?name=Homer')
      );
      // This actually returns 0 for now because search doesn't know about cache-only resources
      expect(bundle?.entry?.length).toEqual(0);

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
});

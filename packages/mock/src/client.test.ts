import {
  allOk,
  ClientStorage,
  ContentType,
  getReferenceString,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
  LoginState,
  NewPatientRequest,
  NewProjectRequest,
  NewUserRequest,
  OperationOutcomeError,
} from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { Bundle, CodeableConcept, Patient, SearchParameter, ServiceRequest } from '@medplum/fhirtypes';
import { randomUUID, webcrypto } from 'crypto';
import { TextEncoder } from 'util';
import { MockAsyncClientStorage, MockClient } from './client';
import { DrAliceSmith, DrAliceSmithSchedule, HomerSimpson } from './mocks';

describe('MockClient', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);

    Object.defineProperty(global, 'TextEncoder', {
      value: TextEncoder,
    });

    Object.defineProperty(global, 'crypto', {
      value: webcrypto,
    });
  });

  test('Simple route', async () => {
    const client = new MockClient();
    const result = await client.get('fhir/R4/Patient/123');
    expect(result).toMatchObject(HomerSimpson);
  });

  test('Handles options', async () => {
    const client = new MockClient();
    const result = await client.get('fhir/R4/Patient/123', { cache: 'reload' });
    expect(result).toMatchObject(HomerSimpson);
  });

  test('Profile', () => {
    const client = new MockClient();
    expect(client.getProfile()).toMatchObject({ resourceType: 'Practitioner' });
  });

  test('Login', async () => {
    const client = new MockClient();
    expect(await client.post('auth/login', '{"password":"password"}')).toBeDefined();
    try {
      await client.post('auth/login', '{"password":"wrong"}');
      fail('Should have failed');
    } catch (err) {
      expect(err).toBeDefined();
    }
  });

  test('Login override', () => {
    const client = new MockClient();
    expect(client.getActiveLogin()).toBeUndefined();

    client.setActiveLoginOverride({} as LoginState);
    expect(client.getActiveLogin()).toBeDefined();
  });

  test('Change password', async () => {
    const client = new MockClient();
    expect(await client.post('auth/changepassword', '{"oldPassword":"orange"}')).toMatchObject(allOk);
    try {
      await client.post('auth/changepassword', '{"oldPassword":"banana"}');
      fail('Should have failed');
    } catch (err) {
      expect(err).toBeDefined();
    }
  });

  test('Set password', async () => {
    const client = new MockClient();
    expect(await client.post('auth/setpassword', '{"password":"orange"}')).toMatchObject(allOk);
    try {
      await client.post('auth/setpassword', '{"password":"banana"}');
      fail('Should have failed');
    } catch (err) {
      expect(err).toBeDefined();
    }
  });

  test('Reset password', async () => {
    const client = new MockClient();
    expect(await client.post('auth/resetpassword', '{"email":"admin@example.com"}')).toMatchObject(allOk);
    try {
      await client.post('auth/resetpassword', '{"email":"other@example.com"}');
      fail('Should have failed');
    } catch (err) {
      expect(err).toBeDefined();
    }
  });

  test('New project success', async () => {
    const client = new MockClient();

    const newUserRequest: NewUserRequest = {
      firstName: 'Sally',
      lastName: 'Foo',
      email: `george@example.com`,
      password: 'password',
      recaptchaToken: 'xyz',
    };

    const response1 = await client.startNewUser(newUserRequest);
    expect(response1).toBeDefined();

    const newProjectRequest: NewProjectRequest = {
      login: response1.login,
      projectName: 'Sally World',
    };

    const response2 = await client.startNewProject(newProjectRequest);
    expect(response2).toBeDefined();

    const response3 = await client.processCode(response2.code as string);
    expect(response3).toBeDefined();
  });

  test('New patient success', async () => {
    const client = new MockClient();

    const newUserRequest: NewUserRequest = {
      firstName: 'Sally',
      lastName: 'Foo',
      email: `george@example.com`,
      password: 'password',
      recaptchaToken: 'xyz',
    };

    const response1 = await client.startNewUser(newUserRequest);
    expect(response1).toBeDefined();

    const newPatientRequest: NewPatientRequest = {
      login: response1.login,
      projectId: '123',
    };

    const response2 = await client.startNewPatient(newPatientRequest);
    expect(response2).toBeDefined();

    const response3 = await client.processCode(response2.code as string);
    expect(response3).toBeDefined();
  });

  test('Register error', async () => {
    const client = new MockClient();

    try {
      await client.post('auth/newuser', JSON.stringify({ email: 'other@example.com', password: 'password' }));
      fail('Should have failed');
    } catch (err) {
      expect(err).toBeDefined();
    }

    try {
      await client.post('auth/newuser', JSON.stringify({ email: 'george@example.com', password: 'wrong' }));
      fail('Should have failed');
    } catch (err) {
      expect(err).toBeDefined();
    }
  });

  test('Who am i', async () => {
    const client = new MockClient();
    expect(await client.get('auth/me')).toMatchObject({ profile: DrAliceSmith });
  });

  test('MFA status', async () => {
    const client = new MockClient();
    expect(await client.get('auth/mfa/status')).toMatchObject({ enrolled: false });
  });

  test('MFA enroll', async () => {
    const client = new MockClient();
    expect(await client.post('auth/mfa/enroll', { token: 'foo' })).toMatchObject(allOk);
  });

  test('Batch request', async () => {
    const client = new MockClient();
    await expect(
      client.post(
        'fhir/R4',
        JSON.stringify({
          resourceType: 'Bundle',
          type: 'batch',
          entry: [
            {
              request: {
                method: 'GET',
                url: 'Patient/123',
              },
            },
            {
              request: {
                method: 'GET',
                url: 'Questionnaire/not-found',
              },
            },
            {
              request: {
                method: 'POST',
                url: 'Patient',
              },
              resource: {
                resourceType: 'Patient',
                name: [{ given: ['John'], family: 'Doe' }],
              },
            },
          ],
        })
      )
    ).resolves.toMatchObject({
      resourceType: 'Bundle',
      type: 'batch-response',
      entry: [
        {
          resource: HomerSimpson,
          response: {
            status: '200',
          },
        },
        {
          response: {
            status: '404',
          },
        },
        {
          resource: {
            resourceType: 'Patient',
            name: [{ given: ['John'], family: 'Doe' }],
          },
          response: {
            status: '201',
          },
        },
      ],
    });
  });

  test('Debug mode', async () => {
    console.log = jest.fn();
    const client = new MockClient({ debug: true });
    await client.get('not-found');
    expect(console.log).toHaveBeenCalled();
  });

  test('Search', async () => {
    const client = new MockClient();
    const result = await client.search('Patient', 'name=Simpson');
    expect(result.entry).toHaveLength(2);
  });

  test('Create binary success', async () => {
    const client = new MockClient();
    const result = await client.createBinary('test', 'test.txt', ContentType.TEXT);
    expect(result).toMatchObject({
      resourceType: 'Binary',
      contentType: ContentType.TEXT,
    });
  });

  test('Create binary with progress listener', async () => {
    const client = new MockClient();
    const onProgress = jest.fn();
    const result = await client.createBinary('test', 'test.txt', ContentType.TEXT, onProgress);
    expect(result).toMatchObject({
      resourceType: 'Binary',
      contentType: ContentType.TEXT,
    });
    expect(onProgress).toHaveBeenCalled();
  });

  test('Create binary with error', async () => {
    const client = new MockClient();
    try {
      await client.createBinary('test', 'test.exe', 'application/exe');
      fail('Should have failed');
    } catch (err) {
      expect(err).toBeDefined();
    }
  });

  test('Create PDF', async () => {
    const client = new MockClient();
    const result = await client.createPdf({ content: ['Hello World'] });
    expect(result).toBeDefined();

    console.log = jest.fn();
    const client2 = new MockClient({ debug: true });
    const result2 = await client2.createPdf({ content: ['Hello World'] });
    expect(result2).toBeDefined();
    expect(console.log).toHaveBeenCalled();
  });

  test('Read resource', async () => {
    const client = new MockClient();
    const resource1 = await client.createResource<Patient>({ resourceType: 'Patient' });
    expect(resource1).toBeDefined();
    const resource2 = await client.readResource('Patient', resource1.id as string);
    expect(resource2).toBeDefined();
    expect(resource2).toEqual(resource1);
    expect(resource2).not.toBe(resource1);
  });

  test('Read resource not found', async () => {
    const client = new MockClient();
    try {
      await client.readResource('Patient', randomUUID());
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.id).toEqual('not-found');
    }
  });

  test('Read resource after delete', async () => {
    const client = new MockClient();
    const patient = await client.createResource<Patient>({ resourceType: 'Patient' });
    await client.deleteResource('Patient', patient.id as string);
    try {
      await client.readResource('Patient', randomUUID());
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.id).toEqual('not-found');
    }
  });

  test('Read history', async () => {
    const client = new MockClient();
    const resource1 = await client.createResource<Patient>({ resourceType: 'Patient' });
    expect(resource1).toBeDefined();
    const resource2 = await client.readHistory('Patient', resource1.id as string);
    expect(resource2).toBeDefined();
    expect(resource2.resourceType).toEqual('Bundle');
  });

  test('Read history not found', async () => {
    const client = new MockClient();
    try {
      await client.readHistory('Patient', randomUUID());
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.id).toEqual('not-found');
    }
  });

  test('Read version', async () => {
    const client = new MockClient();
    const resource1 = await client.createResource<Patient>({ resourceType: 'Patient' });
    expect(resource1).toBeDefined();
    const resource2 = await client.readVersion('Patient', resource1.id as string, resource1.meta?.versionId as string);
    expect(resource2).toBeDefined();
    expect(resource2).toEqual(resource1);
    expect(resource2).not.toBe(resource1);
  });

  test('Read version not found', async () => {
    const client = new MockClient();
    const resource1 = await client.createResource<Patient>({ resourceType: 'Patient' });
    expect(resource1).toBeDefined();
    try {
      await client.readVersion('Patient', resource1.id as string, randomUUID());
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.id).toEqual('not-found');
    }
  });

  test('Update resource', async () => {
    const client = new MockClient();

    const resource1 = await client.createResource<Patient>({
      resourceType: 'Patient',
    });
    expect(resource1).toBeDefined();

    const resource2 = await client.updateResource({ ...resource1, active: true });
    expect(resource2).toBeDefined();
    expect(resource2.id).toEqual(resource1.id);
    expect(resource2.meta?.versionId).not.toEqual(resource1.meta?.versionId);
  });

  test('Patch resource', async () => {
    const client = new MockClient();

    const resource1 = await client.createResource<Patient>({
      resourceType: 'Patient',
    });
    expect(resource1).toBeDefined();

    const resource2 = await client.patchResource('Patient', resource1.id as string, [
      {
        op: 'add',
        path: '/active',
        value: true,
      },
    ]);
    expect(resource2).toBeDefined();
    expect(resource2.id).toEqual(resource1.id);
    expect(resource2.meta?.versionId).not.toEqual(resource1.meta?.versionId);
  });

  test('Patch resource preserves original', async () => {
    const client = new MockClient();

    const resource1 = await client.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Homer'], family: 'Simpson' }],
    });
    expect(resource1).toBeDefined();

    const resource2 = await client.patchResource('Patient', resource1.id as string, [
      {
        op: 'replace',
        path: '/name/0/given/0',
        value: 'Marge',
      },
    ]);
    expect(resource2).toBeDefined();
    expect(resource2.name?.[0].given?.[0]).toEqual('Marge');
    expect(resource1.name?.[0].given?.[0]).toEqual('Homer');
    expect(resource2.meta?.versionId).not.toEqual(resource1.meta?.versionId);
  });

  test('Patch resource errors', async () => {
    const client = new MockClient();

    const resource1 = await client.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Bart'], family: 'Simpson' }],
    });
    expect(resource1).toBeDefined();

    try {
      await client.patchResource('Patient', resource1.id as string, [
        {
          op: 'test',
          path: '/name/0/given/0',
          value: 'Homer',
        },
        {
          op: 'replace',
          path: '/name/0/given/0',
          value: 'Marge',
        },
      ]);
      fail('Expected error');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.issue?.[0].details?.text).toEqual('Test failed: Bart != Homer');
    }
  });

  test('Preserve history', async () => {
    const client = new MockClient();

    const resource1 = await client.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      orderDetail: [{ text: 'foo' }],
    });
    expect(resource1).toBeDefined();

    // Explicitly edit the resource in place
    // While this is not recommended, it is supported
    (resource1.orderDetail as CodeableConcept[])[0].text = 'bar';

    const resource2 = await client.updateResource(resource1);
    expect(resource2).toBeDefined();
    expect(resource2.id).toEqual(resource1.id);
    expect(resource2.meta?.versionId).not.toEqual(resource1.meta?.versionId);

    const history = await client.readHistory('ServiceRequest', resource1.id as string);
    expect(history).toBeDefined();
    expect(history.entry).toHaveLength(2);
    expect((history.entry?.[0]?.resource as ServiceRequest).orderDetail?.[0]?.text).toEqual('bar');
    expect((history.entry?.[1]?.resource as ServiceRequest).orderDetail?.[0]?.text).toEqual('foo');
  });

  test('Delete resource', async () => {
    const client = new MockClient();

    const resource1 = await client.createResource<Patient>({
      resourceType: 'Patient',
    });
    expect(resource1).toBeDefined();

    const resource2 = await client.readResource('Patient', resource1.id as string);
    expect(resource2).toBeDefined();
    expect(resource2.id).toEqual(resource1.id);

    await client.deleteResource('Patient', resource1.id as string);

    try {
      await client.readResource('Patient', resource1.id as string);
      fail('Should have thrown');
    } catch (err) {
      const outcome = (err as OperationOutcomeError).outcome;
      expect(outcome.id).toEqual('not-found');
    }
  });

  test('Slot search', async () => {
    const client = new MockClient();

    const startDate = new Date();
    startDate.setDate(1);

    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(1);

    const slots = await client.searchResources(
      'Slot',
      new URLSearchParams([
        ['_count', (30 * 24).toString()],
        ['schedule', getReferenceString(DrAliceSmithSchedule)],
        ['start', 'gt' + startDate.toISOString()],
        ['start', 'lt' + endDate.toISOString()],
      ])
    );
    expect(slots.length).toBeGreaterThan(0);
  });

  test('Identifier search', async () => {
    const medplum = new MockClient();
    // Create an original Patient with several identifiers
    const patient1: Patient = await medplum.createResource({
      resourceType: 'Patient',
      identifier: [
        {
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'SS',
                display: 'Social Security Number',
              },
            ],
            text: 'Social Security Number',
          },
          system: 'http://hl7.org/fhir/sid/us-ssn',
          value: '999-47-5984',
        },
        {
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'DL',
                display: "Driver's License",
              },
            ],
            text: "Driver's License",
          },
          system: 'urn:oid:2.16.840.1.113883.4.3.25',
          value: 'S99985931',
        },
      ],
      birthDate: '1948-07-01',
      name: [
        {
          family: 'Smith',
          given: ['John'],
        },
      ],
    });

    expect(patient1).toBeDefined();

    const existingPatients = await medplum.search('Patient', 'identifier=999-47-5984');
    expect(existingPatients.total).toEqual(1);
  });

  test('Search one', async () => {
    const medplum = new MockClient();
    // Create an original Patient with several identifiers
    const patient1: Patient = await medplum.createResource({
      resourceType: 'Patient',
      identifier: [
        {
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'SS',
                display: 'Social Security Number',
              },
            ],
            text: 'Social Security Number',
          },
          system: 'http://hl7.org/fhir/sid/us-ssn',
          value: '999-47-5984',
        },
        {
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'DL',
                display: "Driver's License",
              },
            ],
            text: "Driver's License",
          },
          system: 'urn:oid:2.16.840.1.113883.4.3.25',
          value: 'S99985931',
        },
      ],
      birthDate: '1948-07-01',
      name: [
        {
          family: 'Smith',
          given: ['John'],
        },
      ],
    });

    expect(patient1).toBeDefined();

    const existingPatient = await medplum.searchOne('Patient', 'identifier=999-47-5984');
    expect(existingPatient).toBeDefined();
  });

  test('Project admin', async () => {
    const medplum = new MockClient();

    const project = await medplum.get('admin/project/123');
    expect(project).toBeDefined();

    const membership = await medplum.get('admin/project/123/membership/456');
    expect(membership).toBeDefined();
  });

  test('GraphQL', async () => {
    const medplum = new MockClient();

    const result = await medplum.graphql(`
      query {
        PatientList {
          resourceType
          id
          name {
            given
            family
          }
        }
      }
    `);
    expect(result).toBeDefined();

    const homer = result.data.PatientList.find((p: any) => p.id === HomerSimpson.id);
    expect(homer).toBeDefined();
    expect(homer.name[0].given[0]).toEqual('Homer');
    expect(homer.name[0].family).toEqual('Simpson');
  });
});

describe('MockAsyncClientStorage', () => {
  let clientStorage: MockAsyncClientStorage;

  test('Constructor creates instance of ClientStorage', () => {
    clientStorage = new MockAsyncClientStorage();
    expect(clientStorage).toBeInstanceOf(ClientStorage);
  });

  test('.getInitPromise() returns a promise', () => {
    expect(clientStorage.getInitPromise()).toBeInstanceOf(Promise);
  });

  test('Calling .setInitialized() resolves initPromise', async () => {
    expect(clientStorage.isInitialized).toEqual(false);
    const initPromise = clientStorage.getInitPromise();
    clientStorage.setInitialized();
    await expect(initPromise).resolves;
    expect(clientStorage.isInitialized).toEqual(true);
  });

  test('Not calling .setInitialized() causes promise not to resolve', async () => {
    const anotherStorage = new MockAsyncClientStorage();
    const initPromise = anotherStorage.getInitPromise();
    initPromise
      .then(() => {
        throw new Error('Failed!');
      })
      .catch((err) => {
        throw err;
      });
    await new Promise(process.nextTick);
  });
});

function fail(reason: string): never {
  throw new Error(reason);
}

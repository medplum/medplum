import {
  allOk,
  badRequest,
  LoginState,
  NewPatientRequest,
  NewProjectRequest,
  NewUserRequest,
  notFound,
} from '@medplum/core';
import { CodeableConcept, OperationOutcome, Patient, ServiceRequest } from '@medplum/fhirtypes';
import { randomUUID, webcrypto } from 'crypto';
import { TextEncoder } from 'util';
import { MockClient } from './client';
import { HomerSimpson } from './mocks';

describe('MockClient', () => {
  beforeAll(() => {
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

  test('Login', () => {
    const client = new MockClient();
    expect(client.post('auth/login', '{"password":"password"}')).resolves.toBeDefined();
    expect(client.post('auth/login', '{"password":"wrong"}')).rejects.toBeDefined();
  });

  test('Login override', () => {
    const client = new MockClient();
    expect(client.getActiveLogin()).toBeUndefined();

    client.setActiveLoginOverride({} as LoginState);
    expect(client.getActiveLogin()).toBeDefined();
  });

  test('Change password', () => {
    const client = new MockClient();
    expect(client.post('auth/changepassword', '{"oldPassword":"orange"}')).resolves.toMatchObject(allOk);
    expect(client.post('auth/changepassword', '{"oldPassword":"banana"}')).rejects.toBeDefined();
  });

  test('Set password', () => {
    const client = new MockClient();
    expect(client.post('auth/setpassword', '{"password":"orange"}')).resolves.toMatchObject(allOk);
    expect(client.post('auth/setpassword', '{"password":"banana"}')).rejects.toBeDefined();
  });

  test('Reset password', () => {
    const client = new MockClient();
    expect(client.post('auth/resetpassword', '{"email":"admin@example.com"}')).resolves.toMatchObject(allOk);
    expect(client.post('auth/resetpassword', '{"email":"other@example.com"}')).rejects.toBeDefined();
  });

  test('New project success', async () => {
    const client = new MockClient();

    const newUserRequest: NewUserRequest = {
      email: `george@example.com`,
      password: 'password',
      recaptchaToken: 'xyz',
    };

    const response1 = await client.startNewUser(newUserRequest);
    expect(response1).toBeDefined();

    const newProjectRequest: NewProjectRequest = {
      firstName: 'Sally',
      lastName: 'Foo',
      projectName: 'Sally World',
    };

    const response2 = await client.startNewProject(newProjectRequest, response1);
    expect(response2).toBeDefined();

    const response3 = await client.processCode(response2.code as string);
    expect(response3).toBeDefined();
  });

  test('New patient success', async () => {
    const client = new MockClient();

    const newUserRequest: NewUserRequest = {
      email: `george@example.com`,
      password: 'password',
      recaptchaToken: 'xyz',
    };

    const response1 = await client.startNewUser(newUserRequest);
    expect(response1).toBeDefined();

    const newPatientRequest: NewPatientRequest = {
      firstName: 'Sally',
      lastName: 'Foo',
      projectId: '123',
    };

    const response2 = await client.startNewPatient(newPatientRequest, response1);
    expect(response2).toBeDefined();

    const response3 = await client.processCode(response2.code as string);
    expect(response3).toBeDefined();
  });

  test('Register error', async () => {
    const client = new MockClient();
    expect(
      client.post('auth/newuser', JSON.stringify({ email: 'other@example.com', password: 'password' }))
    ).rejects.toBeDefined();
    expect(
      client.post('auth/newuser', JSON.stringify({ email: 'george@example.com', password: 'wrong' }))
    ).rejects.toBeDefined();
  });

  test('Who am i', () => {
    const client = new MockClient();
    expect(client.get('auth/me')).resolves.toMatchObject({
      profile: { reference: 'Practitioner/123' },
    });
  });

  test('Batch request', async () => {
    const client = new MockClient();
    await expect(
      client.post(
        'fhir/R4',
        JSON.stringify({
          resourceType: 'Bundle',
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
          resource: notFound,
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
            status: '200',
          },
        },
      ],
    });
  });

  test('Request schema', async () => {
    const client = new MockClient();
    const schema = await client.requestSchema('Patient');
    expect(schema).toBeDefined();
    expect(schema.types['Patient']).toBeDefined();
    expect(schema.types['Patient'].searchParams).toBeDefined();
  });

  test('Get cached schema', async () => {
    const client = new MockClient();
    const schema = await client.requestSchema('Patient');
    expect(schema).toBeDefined();
    expect(schema.types['Patient']).toBeDefined();

    const schema2 = await client.requestSchema('Patient');
    expect(schema2).toEqual(schema);
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

  test('Create binary', async () => {
    const client = new MockClient();
    expect(client.createBinary(null, 'test.exe', 'application/exe')).rejects.toMatchObject(
      badRequest('Invalid file type')
    );
    expect(client.createBinary(null, 'test.txt', 'text/plain')).resolves.toMatchObject({
      resourceType: 'Binary',
      title: 'test.txt',
      contentType: 'text/plain',
    });
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
      expect((err as OperationOutcome).id).toEqual('not-found');
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
      expect((err as OperationOutcome).id).toEqual('not-found');
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
      expect((err as OperationOutcome).id).toEqual('not-found');
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
      expect((err as OperationOutcome).id).toEqual('not-found');
    }
  });

  test('Empty search', async () => {
    const client = new MockClient();
    const result = await client.search('Schedule', 'name=');
    expect(result.entry).toHaveLength(1);
  });
});

import { allOk, badRequest, LoginState, notFound } from '@medplum/core';
import { MockClient } from './client';
import { HomerSimpson } from './mocks';

describe('MockClient', () => {
  test('Simple route', async () => {
    const client = new MockClient();
    const result = await client.get('fhir/R4/Patient/123');
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

  test('Register', () => {
    const client = new MockClient();
    expect(
      client.post('auth/register', JSON.stringify({ email: 'george@example.com', password: 'password' }))
    ).resolves.toMatchObject(allOk);
    expect(
      client.post('auth/register', JSON.stringify({ email: 'other@example.com', password: 'password' }))
    ).rejects.toBeDefined();
    expect(
      client.post('auth/register', JSON.stringify({ email: 'george@example.com', password: 'wrong' }))
    ).rejects.toBeDefined();
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
    expect(console.log).toHaveBeenCalledTimes(3);
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
});

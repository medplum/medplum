import { LoginState } from '@medplum/core';
import { MockClient } from './client';
import { HomerSimpson } from './mocks';

describe('MockClient', () => {
  test('Simple route', async () => {
    const client = new MockClient();
    const result = await client.get('fhir/R4/Patient/123');
    expect(result).toMatchObject(HomerSimpson);
  });

  test.skip('Function route', async () => {
    const foo = { foo: 'bar' };

    const client = new MockClient();
    //   {
    //   x: {
    //     GET: () => foo,
    //   },
    // }

    const result = await client.get('x');
    expect(result).toMatchObject(foo);
  });

  test('Profile', () => {
    const client = new MockClient();
    expect(client.getProfile()).toMatchObject({ resourceType: 'Practitioner' });
  });

  test('Login override', () => {
    const client = new MockClient();
    expect(client.getActiveLogin()).toBeUndefined();

    client.setActiveLoginOverride({} as LoginState);
    expect(client.getActiveLogin()).toBeDefined();
  });
});

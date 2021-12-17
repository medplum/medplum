import { LoginState } from '@medplum/core';
import { MockClient } from './MockClient';

describe('MockClient', () => {
  test('Simple route', async () => {
    const foo = { foo: 'bar' };

    const client = new MockClient({
      x: {
        GET: foo,
      },
    });

    const result = await client.get('x');
    expect(result).toMatchObject(foo);
  });

  test('Function route', async () => {
    const foo = { foo: 'bar' };

    const client = new MockClient({
      x: {
        GET: () => foo,
      },
    });

    const result = await client.get('x');
    expect(result).toMatchObject(foo);
  });

  test('Profile', () => {
    const client = new MockClient({});
    expect(client.getProfile()).toMatchObject({ resourceType: 'Practitioner' });
  });

  test('Login override', () => {
    const client = new MockClient({});
    expect(client.getActiveLogin()).toBeUndefined();

    client.setActiveLoginOverride({} as LoginState);
    expect(client.getActiveLogin()).toBeDefined();
  });
});

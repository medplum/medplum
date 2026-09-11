// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumServerConfig } from './config/types';

const { initAppServices, shutdownApp } = vi.hoisted(() => ({
  initAppServices: vi.fn(),
  shutdownApp: vi.fn(),
}));
vi.mock('./app', () => ({ initAppServices, shutdownApp }));

const { loadTestConfig } = vi.hoisted(() => ({ loadTestConfig: vi.fn() }));
vi.mock('./config/loader', () => ({ loadTestConfig }));

const { createResource, getShardSystemRepo } = vi.hoisted(() => {
  const createResource = vi.fn(async (resource: any) => ({
    ...resource,
    id: `${resource.resourceType}-test-id`,
  }));
  return { createResource, getShardSystemRepo: vi.fn(() => ({ createResource })) };
});
vi.mock('./fhir/repo', () => ({ getShardSystemRepo }));

const { generateAccessToken } = vi.hoisted(() => ({ generateAccessToken: vi.fn(async () => 'test-access-token') }));
vi.mock('./oauth/keys', () => ({ generateAccessToken }));

import { PLACEHOLDER_SHARD_ID } from './fhir/sharding';
import setup from './test.global-setup';

describe('test.global-setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createResource.mockImplementation(async (resource: any) => ({
      ...resource,
      id: `${resource.resourceType}-test-id`,
    }));
    generateAccessToken.mockResolvedValue('test-access-token');
  });

  test('provisions a shared Super Admin project and provides its ids/token', async () => {
    const config = { database: {} } as unknown as MedplumServerConfig;
    loadTestConfig.mockResolvedValue(config);

    const provide = vi.fn();
    await setup({ provide } as any);

    expect(loadTestConfig).toHaveBeenCalledTimes(1);
    expect(initAppServices).toHaveBeenCalledExactlyOnceWith(config);
    expect(getShardSystemRepo).toHaveBeenCalledExactlyOnceWith(PLACEHOLDER_SHARD_ID);

    expect(createResource).toHaveBeenCalledTimes(4);

    const [projectArg] = createResource.mock.calls[0];
    expect(projectArg).toMatchObject({
      resourceType: 'Project',
      strictMode: true,
      features: ['bots', 'email', 'graphql-introspection', 'cron'],
      secret: [{ name: 'foo', valueString: 'bar' }],
      superAdmin: true,
    });
    expect(projectArg.owner.reference).toMatch(/^User\//);

    const [clientArg] = createResource.mock.calls[1];
    expect(clientArg).toMatchObject({
      resourceType: 'ClientApplication',
      redirectUris: ['https://example.com/'],
      meta: { project: 'Project-test-id' },
    });

    const [membershipArg] = createResource.mock.calls[2];
    expect(membershipArg).toMatchObject({
      resourceType: 'ProjectMembership',
      user: { reference: 'ClientApplication/ClientApplication-test-id' },
      profile: { reference: 'ClientApplication/ClientApplication-test-id' },
      project: { reference: 'Project/Project-test-id' },
    });

    const [loginArg] = createResource.mock.calls[3];
    expect(loginArg).toMatchObject({
      resourceType: 'Login',
      authMethod: 'client',
      user: { reference: 'ClientApplication/ClientApplication-test-id' },
      client: { reference: 'ClientApplication/ClientApplication-test-id' },
      membership: { reference: 'ProjectMembership/ProjectMembership-test-id' },
      scope: 'openid',
    });
    expect(() => new Date(loginArg.authTime).toISOString()).not.toThrow();

    expect(generateAccessToken).toHaveBeenCalledExactlyOnceWith({
      login_id: 'Login-test-id',
      sub: 'ClientApplication-test-id',
      username: 'ClientApplication-test-id',
      client_id: 'ClientApplication-test-id',
      profile: 'ClientApplication/ClientApplication-test-id',
      scope: 'openid',
    });

    expect(provide).toHaveBeenCalledWith('superAdminProjectId', 'Project-test-id');
    expect(provide).toHaveBeenCalledWith('superAdminClientId', 'ClientApplication-test-id');
    expect(provide).toHaveBeenCalledWith('superAdminMembershipId', 'ProjectMembership-test-id');
    expect(provide).toHaveBeenCalledWith('superAdminLoginId', 'Login-test-id');
    expect(provide).toHaveBeenCalledWith('superAdminAccessToken', 'test-access-token');
    expect(provide).toHaveBeenCalledTimes(5);

    expect(shutdownApp).toHaveBeenCalledTimes(1);
  });

  test('shuts down the app even though createResource calls happen before it', async () => {
    loadTestConfig.mockResolvedValue({});
    const provideOrder: string[] = [];
    const provide = vi.fn((key: string) => provideOrder.push(key));

    await setup({ provide } as any);

    const invocationOrders = createResource.mock.invocationCallOrder;
    const lastCreateResourceOrder = invocationOrders[invocationOrders.length - 1];
    const shutdownOrder = shutdownApp.mock.invocationCallOrder[0];
    expect(shutdownOrder).toBeGreaterThan(lastCreateResourceOrder);
    expect(provideOrder).toEqual([
      'superAdminProjectId',
      'superAdminClientId',
      'superAdminMembershipId',
      'superAdminLoginId',
      'superAdminAccessToken',
    ]);
  });
});

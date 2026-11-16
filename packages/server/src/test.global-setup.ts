// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { ClientApplication, Login, Project, ProjectMembership } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import type { TestProject } from 'vitest/node';
import { initAppServices, shutdownApp } from './app';
import { loadTestConfig } from './config/loader';
import { getShardSystemRepo } from './fhir/repo';
import { PLACEHOLDER_SHARD_ID } from './fhir/sharding';
import { generateAccessToken } from './oauth/keys';

declare module 'vitest' {
  export interface ProvidedContext {
    superAdminProjectId: string;
    superAdminClientId: string;
    superAdminMembershipId: string;
    superAdminLoginId: string;
    superAdminAccessToken: string;
  }
}

/**
 * Runs once for the entire Vitest run (not per test file), before any test file is loaded.
 * Creates a single Super Admin Project/ClientApplication/ProjectMembership/Login/accessToken
 * shared by every test file's `getSuperAdminTestProject()`/`getSuperAdminAccessToken()`
 * (see `test.setup.ts`), instead of every file provisioning its own. Every test worker
 * connects to the same real Postgres database, and the JWT signing key is DB-persisted
 * (see `initKeys` in `oauth/keys.ts`), so a token minted here verifies in any worker.
 * @param project - The Vitest global setup context.
 * @param project.provide - Hands the created resources' ids and a ready-to-use access token
 *   to every test file via `inject`.
 */
export default async function setup({ provide }: TestProject): Promise<void> {
  const config = await loadTestConfig();
  await initAppServices(config);

  const systemRepo = getShardSystemRepo(PLACEHOLDER_SHARD_ID);

  const project = await systemRepo.createResource<Project>({
    resourceType: 'Project',
    name: 'Shared Super Admin Test Project',
    owner: { reference: 'User/' + randomUUID() },
    strictMode: true,
    features: ['bots', 'email', 'graphql-introspection', 'cron'],
    secret: [{ name: 'foo', valueString: 'bar' }],
    superAdmin: true,
  });

  const client = await systemRepo.createResource<ClientApplication>({
    resourceType: 'ClientApplication',
    secret: randomUUID(),
    redirectUris: ['https://example.com/'],
    meta: { project: project.id },
    name: 'Shared Super Admin Test Client',
    signInForm: {
      welcomeString: 'Test Welcome String',
      logo: { url: 'https://example.com/logo.png' },
    },
  });

  const membership = await systemRepo.createResource<ProjectMembership>({
    resourceType: 'ProjectMembership',
    user: createReference(client),
    profile: createReference(client),
    project: createReference(project),
  });

  const scope = 'openid';
  const login = await systemRepo.createResource<Login>({
    resourceType: 'Login',
    authMethod: 'client',
    user: createReference(client),
    client: createReference(client),
    membership: createReference(membership),
    authTime: new Date().toISOString(),
    scope,
  });

  const accessToken = await generateAccessToken({
    login_id: login.id,
    sub: client.id,
    username: client.id,
    client_id: client.id,
    profile: client.resourceType + '/' + client.id,
    scope,
  });

  provide('superAdminProjectId', project.id);
  provide('superAdminClientId', client.id);
  provide('superAdminMembershipId', membership.id);
  provide('superAdminLoginId', login.id);
  provide('superAdminAccessToken', accessToken);

  await shutdownApp();
}

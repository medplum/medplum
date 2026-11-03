// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { MedplumClient } from '@medplum/core';
import type { Project } from '@medplum/fhirtypes';
import type { Page } from '@playwright/test';
import { test as base, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { RequestListener } from 'node:http';
import type { Server } from 'node:https';
import { createServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { getLocalhostCertificate } from './certs';
import { SERVER_URL } from './urls';

/** A project created for a single test, with its owner signed in as a project admin. */
export interface TestProject {
  project: WithId<Project>;
  email: string;
  password: string;
  medplum: MedplumClient;
}

interface TestFixtures {
  testProject: TestProject;
  /** Starts an HTTPS server with a certificate the Medplum server trusts. Stopped after the test. */
  startHttpsServer: (handler: RequestListener) => Promise<URL>;
}

interface WorkerFixtures {
  superAdmin: MedplumClient;
}

// Fixtures name Playwright's `use` callback `provide`; eslint's React hooks rule misreads `use(...)` as a hook call
export const test = base.extend<TestFixtures, WorkerFixtures>({
  superAdmin: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, provide) => {
      await provide(await signInClient('admin@example.com', 'medplum_admin'));
    },
    { scope: 'worker' },
  ],

  testProject: async ({ superAdmin }, provide, testInfo) => {
    await provide(await createTestProject(superAdmin, testInfo.title));
  },

  // eslint-disable-next-line no-empty-pattern
  startHttpsServer: async ({}, provide) => {
    const servers: Server[] = [];
    await provide(async (handler) => {
      const server = createServer(getLocalhostCertificate(), handler);
      servers.push(server);
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      return new URL(`https://localhost:${(server.address() as AddressInfo).port}/`);
    });
    for (const server of servers) {
      server.closeAllConnections();
      server.close();
    }
  },
});

export { expect };

/**
 * Creates a project with a new owner, so tests never share data.
 * @param superAdmin - A super admin client.
 * @param name - The project name.
 * @returns The project, the owner's credentials, and a client signed in as the owner.
 */
export async function createTestProject(superAdmin: MedplumClient, name: string): Promise<TestProject> {
  const email = `e2e-${randomUUID()}@example.com`;
  const password = randomUUID();
  const project = await superAdmin.post<WithId<Project>>(superAdmin.fhirUrl('Project', '$init'), {
    resourceType: 'Parameters',
    parameter: [
      { name: 'name', valueString: name },
      { name: 'ownerEmail', valueString: email },
    ],
  });
  await superAdmin.post('admin/super/setpassword', { email, password });
  return { project, email, password, medplum: await signInClient(email, password) };
}

/**
 * Signs in through the API with email and password.
 * @param email - The user's email.
 * @param password - The user's password.
 * @returns A client signed in as the user.
 */
export async function signInClient(email: string, password: string): Promise<MedplumClient> {
  const medplum = new MedplumClient({ baseUrl: SERVER_URL });
  const login = await medplum.startLogin({ email, password });
  await medplum.processCode(login.code as string);
  return medplum;
}

/**
 * Signs in through the app's sign-in form, starting from any page that redirects to it.
 * @param page - The Playwright page.
 * @param email - The user's email.
 * @param password - The user's password.
 */
export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/signin/);
  await page.getByPlaceholder('name@domain.com').fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Password *').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/Patient\?/);
}

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import type { Binary, ClientApplication } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { createTestClient, createTestProject, withTestContext } from '../test.setup';

const app = express();
let client: ClientApplication;

describe('OAuth utils', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    client = await createTestClient();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Success with SignInForm', async () => {
    const res = await request(app).get(`/auth/clientinfo/${client.id}`).type('json');
    expect(res).toHaveStatus(200);
    expect(res.body.welcomeString).toBe(client.signInForm?.welcomeString);
    expect(res.body.logo.url).toBe(client.signInForm?.logo?.url);
  });

  test('Returns showScopeSelection', async () => {
    const clientWithScopeSelection = await createTestClient({
      client: { signInForm: { welcomeString: 'No scopes please', showScopeSelection: false } },
    });
    const res = await request(app).get(`/auth/clientinfo/${clientWithScopeSelection.id}`).type('json');
    expect(res).toHaveStatus(200);
    expect(res.body.welcomeString).toBe('No scopes please');
    expect(res.body.showScopeSelection).toBe(false);
  });

  test('Omits showScopeSelection when not configured', async () => {
    const res = await request(app).get(`/auth/clientinfo/${client.id}`).type('json');
    expect(res).toHaveStatus(200);
    expect(res.body.showScopeSelection).toBeUndefined();
  });

  test('Empty object when SignInForm is not configured', async () => {
    const clientWithoutSignInForm = await createTestClient({ client: { signInForm: undefined } });
    const res = await request(app).get(`/auth/clientinfo/${clientWithoutSignInForm.id}`).type('json');
    expect(res).toHaveStatus(200);
    expect(res.body).toStrictEqual({});
  });

  test('Signs logo in the same project', async () => {
    const { repo } = await createTestProject({ withRepo: true });
    const { binary, clientWithLogo } = await withTestContext(async () => {
      const binary = await repo.createResource<Binary>({ resourceType: 'Binary', contentType: ContentType.TEXT });
      const clientWithLogo = await repo.createResource<ClientApplication>({
        resourceType: 'ClientApplication',
        signInForm: { logo: { url: `Binary/${binary.id}` } },
      });
      return { binary, clientWithLogo };
    });

    const res = await request(app).get(`/auth/clientinfo/${clientWithLogo.id}`).type('json');
    expect(res).toHaveStatus(200);
    expect(res.body.logo.url).toContain(`/storage/${binary.id}/`);
    expect(res.body.logo.url).toContain('Signature=');
  });

  test('Does not sign logo in another project', async () => {
    const { repo } = await createTestProject({ withRepo: true });
    const { repo: otherRepo } = await createTestProject({ withRepo: true });
    const { binary, clientWithLogo } = await withTestContext(async () => {
      const binary = await otherRepo.createResource<Binary>({ resourceType: 'Binary', contentType: ContentType.TEXT });
      const clientWithLogo = await repo.createResource<ClientApplication>({
        resourceType: 'ClientApplication',
        signInForm: { logo: { url: `Binary/${binary.id}` } },
      });
      return { binary, clientWithLogo };
    });

    const res = await request(app).get(`/auth/clientinfo/${clientWithLogo.id}`).type('json');
    expect(res).toHaveStatus(200);
    expect(res.body.logo.url).toBe(`Binary/${binary.id}`);
  });

  test('Invalid client', async () => {
    const res = await request(app).get(`/auth/clientinfo/INVALIDID`).type('json');
    expect(res).toHaveStatus(404);
  });
});

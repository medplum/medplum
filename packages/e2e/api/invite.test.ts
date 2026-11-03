// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumClient } from '@medplum/core';
import { randomUUID } from 'node:crypto';
import { waitForEmail } from '../fixtures/mailpit';
import { expect, signInClient, test } from '../fixtures/test';
import { SERVER_URL } from '../fixtures/urls';

test('Invited user sets a password from the email and signs in', { tag: '@auth' }, async ({ testProject }) => {
  const { medplum, project } = testProject;
  const email = `e2e-${randomUUID()}@example.com`;
  await medplum.post(`admin/projects/${project.id}/invite`, {
    resourceType: 'Practitioner',
    firstName: 'Invited',
    lastName: 'User',
    email,
    sendEmail: true,
  });

  const message = await waitForEmail(email);
  expect(message.subject).toBe('Welcome to Medplum');
  const [, id, secret] = /\/setpassword\/([^/\s]+)\/([^/\s]+)/.exec(message.text) ?? [];
  const password = randomUUID();
  await new MedplumClient({ baseUrl: SERVER_URL }).post('auth/setpassword', { id, secret, password });

  const invited = await signInClient(email, password);
  expect(invited.getProject()?.id).toBe(project.id);
  expect(invited.getProfile()?.resourceType).toBe('Practitioner');
});
